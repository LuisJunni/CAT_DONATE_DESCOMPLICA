const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

  next();
});

app.get("/ping", (req, res) => {
    res.send({ok: true, message:"pong"});
});


const PORT = 3000;
const server = app.listen(PORT, () => {
    console.log(`servidor ok na porta ${PORT}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Erro: a porta ${PORT} já está em uso. Feche o outro processo Node e tente novamente.`);
        return;
    }

    console.error('Erro ao iniciar servidor:', error);
});

const DATA_DIR = path.join(__dirname, "data");
const CATS_FILE = path.join(DATA_DIR, "cats.json");
const CAT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_HOST = process.env.EMAIL_HOST || "";
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_SECURE = process.env.EMAIL_SECURE === "true";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER || "catdonate@localhost";
const DEV_RETURN_CODE = process.env.DEV_RETURN_CODE !== "false";

function ensureCatsStorage() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(CATS_FILE)) {
        fs.writeFileSync(CATS_FILE, "[]", "utf-8");
    }
}

function loadCatsFromFile() {
    try {
        ensureCatsStorage();
        const content = fs.readFileSync(CATS_FILE, "utf-8");
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed)) {
            return [];
        }

        const now = Date.now();
        let changed = false;

        const normalized = parsed
            .map((cat) => {
                const normalizedCat = { ...cat };

                if (typeof normalizedCat.createdAt !== "number") {
                    normalizedCat.createdAt = now;
                    changed = true;
                }

                if (typeof normalizedCat.expiresAt !== "number") {
                    normalizedCat.expiresAt = normalizedCat.createdAt + CAT_TTL_MS;
                    changed = true;
                }

                if (typeof normalizedCat.ownerEmail !== "string") {
                    normalizedCat.ownerEmail = null;
                    changed = true;
                }

                if (!Array.isArray(normalizedCat.comments)) {
                    normalizedCat.comments = [];
                    changed = true;
                } else {
                    normalizedCat.comments = normalizedCat.comments.map((comment) => {
                        const normalizedComment = { ...comment };

                        if (typeof normalizedComment.id !== "number") {
                            normalizedComment.id = Date.now() + Math.floor(Math.random() * 1000);
                            changed = true;
                        }

                        if (typeof normalizedComment.text !== "string") {
                            normalizedComment.text = "";
                            changed = true;
                        }

                        if (typeof normalizedComment.createdAt !== "number") {
                            normalizedComment.createdAt = now;
                            changed = true;
                        }

                        if (typeof normalizedComment.authorEmail !== "string") {
                            normalizedComment.authorEmail = null;
                            changed = true;
                        }

                        return normalizedComment;
                    });
                }

                if (typeof normalizedCat.foto !== "string") {
                    normalizedCat.foto = null;
                    changed = true;
                }

                return normalizedCat;
            })
            .filter((cat) => {
                const isActive = cat.expiresAt > now;
                if (!isActive) {
                    changed = true;
                }
                return isActive;
            });

        if (changed) {
            saveCatsToFile(normalized);
        }

        return normalized;
    } catch (error) {
        console.error("Erro ao carregar cats.json:", error);
        return [];
    }
}

function saveCatsToFile(catsData) {
    fs.writeFileSync(CATS_FILE, JSON.stringify(catsData, null, 2), "utf-8");
}

function removeExpiredCatsInMemory(catsData) {
    const now = Date.now();
    const activeCats = catsData.filter((cat) => cat.expiresAt > now);

    if (activeCats.length === catsData.length) {
        return false;
    }

    catsData.length = 0;
    catsData.push(...activeCats);
    return true;
}

function normalizeEmail(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
        return null;
    }

    return normalized;
}

function createMailTransporter() {
    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_SECURE,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });
}

const mailTransporter = createMailTransporter();

if (mailTransporter) {
    console.log("SMTP configurado: envio de e-mail ativo.");
} else {
    console.warn("SMTP não configurado: o servidor vai retornar devCode no /send-code.");
}

async function sendVerificationEmail(toEmail, code) {
    if (!mailTransporter) {
        return { sent: false, reason: "missing-config" };
    }

    await mailTransporter.sendMail({
        from: EMAIL_FROM,
        to: toEmail,
        subject: "Seu código de verificação - CatDonate",
        text: `Seu código de verificação é ${code}. Ele expira em 3 horas.`,
        html: `<p>Seu código de verificação é <strong>${code}</strong>.</p><p>Ele expira em 3 horas.</p>`
    });

    return { sent: true };
}

const authSessions = {};

function getBearerToken(req) {
    const authHeader = typeof req.headers.authorization === "string"
        ? req.headers.authorization
        : "";

    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return null;
    }

    return token;
}

function getAuthSessionFromRequest(req) {
    const token = getBearerToken(req);
    if (!token) {
        return null;
    }

    const session = authSessions[token];
    if (!session) {
        return null;
    }

    if (Date.now() > session.expiresAt) {
        delete authSessions[token];
        return null;
    }

    return { token, ...session };
}

function getOptionalAuthEmail(req) {
    const session = getAuthSessionFromRequest(req);
    if (!session) {
        return null;
    }

    return session.email;
}

function requireAuth(req, res, next) {
    const session = getAuthSessionFromRequest(req);
    if (!session) {
        return res.status(401).json({ ok: false, message: "Não autenticado." });
    }

    req.authEmail = session.email;
    req.authToken = session.token;
    next();
}


const codigos = {};
app.post("/send-code", async (req,res) => {
const { email } = req.body;
const normalizedEmail = normalizeEmail(email);

if (!normalizedEmail) {
    return res.status(400).json({ ok: false, message: "E-mail inválido." });
}

const code = Math.floor(100000 + Math.random() *900000)
const expires = Date.now() + 3 * 60 * 60 * 1000;
codigos[normalizedEmail] = {
    code,
    expires
}

let emailSent = false;
try {
    const emailResult = await sendVerificationEmail(normalizedEmail, code);
    emailSent = emailResult.sent;
} catch (error) {
    delete codigos[normalizedEmail];
    console.error("Erro ao enviar e-mail:", error);
    return res.status(500).json({ ok: false, message: "Não foi possível enviar o código por e-mail." });
}

console.log(`Código para ${normalizedEmail}: ${code}`)

if (emailSent) {
    return res.json({ ok: true, message: "Código enviado para o e-mail."});
}

console.warn("SMTP não configurado. Retornando código de desenvolvimento na resposta.");
if (!DEV_RETURN_CODE) {
    delete codigos[normalizedEmail];
    return res.status(500).json({ ok: false, message: "Serviço de e-mail não configurado no servidor." });
}

return res.json({
    ok: true,
    message: "Servidor sem SMTP configurado. Use o código de desenvolvimento retornado.",
    devCode: code
});
})

//  Validação de código
app.post("/validate-code", (req, res) => {
 const { email, code} = req.body;
 const normalizedEmail = normalizeEmail(email);
 const numericCode = Number(code);

 if (!normalizedEmail || !Number.isInteger(numericCode)) {
    return res.status(400).json({ ok: false, message: "Dados inválidos." });
 }

 const codeData = codigos[normalizedEmail];
 if (!codeData)
    return res.json({ok:  false ,  message: "Código inválido!"});

 if (Date.now() > codeData.expires) {
    delete codigos[normalizedEmail];
    return res.json({ ok: false, message: "Código expirado. Solicite um novo." });
 }

 if (codeData.code !== numericCode)
    return res.json({ok:false, message: "Código inválido!"});

 delete codigos[normalizedEmail];

 const authToken = crypto.randomUUID();
 const authExpiresAt = Date.now() + AUTH_SESSION_TTL_MS;
 authSessions[authToken] = {
     email: normalizedEmail,
     expiresAt: authExpiresAt
 };

 res.json({
     ok: true,
     message: "Código validado!",
     authToken,
     email: normalizedEmail,
     expiresAt: authExpiresAt
 });

})


//Post de gatos
const cats = loadCatsFromFile();
app.post("/cats", requireAuth, (req, res) => {
   
    const { nome, cor, genero, cidade, descricao, foto } = req.body;

        const nomeLimpo = typeof nome === "string" ? nome.trim() : "";
        const corLimpa = typeof cor === "string" ? cor.trim() : "";
        const generoLimpo = typeof genero === "string" ? genero.trim() : "";
        const cidadeLimpa = typeof cidade === "string" ? cidade.trim() : "";
        const descricaoLimpa = typeof descricao === "string" ? descricao.trim() : "";
        const fotoDataUrl =
            typeof foto === "string" && foto.startsWith("data:image/")
                ? foto
                : null;

        try {
            const removedExpired = removeExpiredCatsInMemory(cats);
            if (removedExpired) {
                saveCatsToFile(cats);
            }
        } catch (error) {
            console.error("Erro ao limpar gatos expirados:", error);
            return res.status(500).json({ ok: false, message: "Erro ao salvar gatinho." });
        }

        if (!nomeLimpo || !corLimpa || !cidadeLimpa) {
            return res.status(400).json({ ok: false, message: "Preencha os campos obrigatórios." });
        }

    const id = Date.now()
    const createdAt = Date.now()
    const expiresAt = createdAt + CAT_TTL_MS;
    const newCat = {
        id,
        nome: nomeLimpo,
        cor: corLimpa,
        genero: generoLimpo,
        cidade: cidadeLimpa,
        descricao: descricaoLimpa,
        foto: fotoDataUrl,
        ownerEmail: req.authEmail,
        createdAt,
        expiresAt,
        comments: []
    }

        cats.push(newCat);

        try {
            saveCatsToFile(cats);
            return res.json({ ok: true, message: "Gatinho cadastrado com sucesso!", cat: newCat });
        } catch (error) {
            cats.pop();
            console.error("Erro ao salvar cats.json:", error);
            return res.status(500).json({ ok: false, message: "Erro ao salvar gatinho." });
        }


});

app.put("/cats/:id", requireAuth, (req, res) => {
    try {
        const removedExpired = removeExpiredCatsInMemory(cats);
        if (removedExpired) {
            saveCatsToFile(cats);
        }

        const catId = Number(req.params.id);
        if (!Number.isInteger(catId)) {
            return res.status(400).json({ ok: false, message: "ID inválido." });
        }

        const cat = cats.find((item) => item.id === catId);
        if (!cat) {
            return res.status(404).json({ ok: false, message: "Gato não encontrado." });
        }

        if (cat.ownerEmail !== req.authEmail) {
            return res.status(403).json({ ok: false, message: "Você só pode editar a sua própria postagem." });
        }

        let changed = false;

        if (Object.prototype.hasOwnProperty.call(req.body, "nome")) {
            const nomeLimpo = typeof req.body.nome === "string" ? req.body.nome.trim() : "";
            if (!nomeLimpo) {
                return res.status(400).json({ ok: false, message: "Nome não pode ser vazio." });
            }
            cat.nome = nomeLimpo;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "cor")) {
            const corLimpa = typeof req.body.cor === "string" ? req.body.cor.trim() : "";
            if (!corLimpa) {
                return res.status(400).json({ ok: false, message: "Cor não pode ser vazia." });
            }
            cat.cor = corLimpa;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "genero")) {
            const generoLimpo = typeof req.body.genero === "string" ? req.body.genero.trim() : "";
            cat.genero = generoLimpo;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "cidade")) {
            const cidadeLimpa = typeof req.body.cidade === "string" ? req.body.cidade.trim() : "";
            if (!cidadeLimpa) {
                return res.status(400).json({ ok: false, message: "Cidade não pode ser vazia." });
            }
            cat.cidade = cidadeLimpa;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "descricao")) {
            const descricaoLimpa = typeof req.body.descricao === "string" ? req.body.descricao.trim() : "";
            cat.descricao = descricaoLimpa;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "foto")) {
            const foto = req.body.foto;

            if (foto === null || foto === "") {
                cat.foto = null;
                changed = true;
            } else if (typeof foto === "string" && foto.startsWith("data:image/")) {
                cat.foto = foto;
                changed = true;
            } else {
                return res.status(400).json({ ok: false, message: "Formato de foto inválido." });
            }
        }

        if (!changed) {
            return res.status(400).json({ ok: false, message: "Nada para atualizar." });
        }

        saveCatsToFile(cats);
        return res.json({ ok: true, message: "Gatinho atualizado com sucesso!", cat });
    } catch (error) {
        console.error("Erro ao atualizar gato:", error);
        return res.status(500).json({ ok: false, message: "Erro ao atualizar gatinho." });
    }
});

app.delete("/cats/:id", requireAuth, (req, res) => {
    try {
        const removedExpired = removeExpiredCatsInMemory(cats);
        if (removedExpired) {
            saveCatsToFile(cats);
        }

        const catId = Number(req.params.id);
        if (!Number.isInteger(catId)) {
            return res.status(400).json({ ok: false, message: "ID inválido." });
        }

        const cat = cats.find((item) => item.id === catId);
        if (!cat) {
            return res.status(404).json({ ok: false, message: "Gato não encontrado." });
        }

        if (cat.ownerEmail !== req.authEmail) {
            return res.status(403).json({ ok: false, message: "Você só pode excluir a sua própria postagem." });
        }

        const index = cats.findIndex((item) => item.id === catId);

        cats.splice(index, 1);
        saveCatsToFile(cats);
        return res.json({ ok: true, message: "Gatinho removido com sucesso!" });
    } catch (error) {
        console.error("Erro ao remover gato:", error);
        return res.status(500).json({ ok: false, message: "Erro ao remover gatinho." });
    }
});


// GET DE GATOS
app.get("/cats", ( req , res) => {
try {
    const removedExpired = removeExpiredCatsInMemory(cats);
    if (removedExpired) {
        saveCatsToFile(cats);
    }

    const requesterEmail = getOptionalAuthEmail(req);
    const safeCats = cats.map((cat) => ({
        id: cat.id,
        nome: cat.nome,
        cor: cat.cor,
        genero: cat.genero,
        cidade: cat.cidade,
        descricao: cat.descricao,
        foto: cat.foto,
        createdAt: cat.createdAt,
        expiresAt: cat.expiresAt,
        canManage: requesterEmail !== null && cat.ownerEmail === requesterEmail,
        comments: Array.isArray(cat.comments)
            ? cat.comments.map((comment) => ({
                id: comment.id,
                text: comment.text,
                createdAt: comment.createdAt,
                updatedAt: comment.updatedAt,
                canManage: requesterEmail !== null && comment.authorEmail === requesterEmail
            }))
            : []
    }));

    return res.json({ok: true, cats: safeCats })
 } catch (error) {return res.status(500).json({ok: false, message:"Erro ao listar gatos!"})}
});

app.post("/cats/:id/comments", requireAuth, (req, res) => {
    try {
        const removedExpired = removeExpiredCatsInMemory(cats);
        if (removedExpired) {
            saveCatsToFile(cats);
        }

        const catId = Number(req.params.id);
        const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

        if (!Number.isInteger(catId)) {
            return res.status(400).json({ ok: false, message: "ID inválido." });
        }

        if (!text) {
            return res.status(400).json({ ok: false, message: "Comentário não pode ser vazio." });
        }

        const cat = cats.find((item) => item.id === catId);
        if (!cat) {
            return res.status(404).json({ ok: false, message: "Gato não encontrado." });
        }

        if (!Array.isArray(cat.comments)) {
            cat.comments = [];
        }

        const comment = {
            id: Date.now(),
            text,
            createdAt: Date.now(),
            authorEmail: req.authEmail
        };

        cat.comments.push(comment);
        saveCatsToFile(cats);

        return res.json({ ok: true, message: "Comentário adicionado!", comment });
    } catch (error) {
        console.error("Erro ao comentar:", error);
        return res.status(500).json({ ok: false, message: "Erro ao adicionar comentário." });
    }
});

app.put("/cats/:catId/comments/:commentId", requireAuth, (req, res) => {
    try {
        const removedExpired = removeExpiredCatsInMemory(cats);
        if (removedExpired) {
            saveCatsToFile(cats);
        }

        const catId = Number(req.params.catId);
        const commentId = Number(req.params.commentId);
        const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

        if (!Number.isInteger(catId) || !Number.isInteger(commentId)) {
            return res.status(400).json({ ok: false, message: "IDs inválidos." });
        }

        if (!text) {
            return res.status(400).json({ ok: false, message: "Comentário não pode ser vazio." });
        }

        const cat = cats.find((item) => item.id === catId);
        if (!cat) {
            return res.status(404).json({ ok: false, message: "Gato não encontrado." });
        }

        if (!Array.isArray(cat.comments)) {
            cat.comments = [];
        }

        const comment = cat.comments.find((item) => item.id === commentId);
        if (!comment) {
            return res.status(404).json({ ok: false, message: "Comentário não encontrado." });
        }

        if (comment.authorEmail !== req.authEmail) {
            return res.status(403).json({ ok: false, message: "Você só pode editar o seu próprio comentário." });
        }

        comment.text = text;
        comment.updatedAt = Date.now();

        saveCatsToFile(cats);
        return res.json({ ok: true, message: "Comentário atualizado!", comment });
    } catch (error) {
        console.error("Erro ao atualizar comentário:", error);
        return res.status(500).json({ ok: false, message: "Erro ao atualizar comentário." });
    }
});

app.delete("/cats/:catId/comments/:commentId", requireAuth, (req, res) => {
    try {
        const removedExpired = removeExpiredCatsInMemory(cats);
        if (removedExpired) {
            saveCatsToFile(cats);
        }

        const catId = Number(req.params.catId);
        const commentId = Number(req.params.commentId);

        if (!Number.isInteger(catId) || !Number.isInteger(commentId)) {
            return res.status(400).json({ ok: false, message: "IDs inválidos." });
        }

        const cat = cats.find((item) => item.id === catId);
        if (!cat) {
            return res.status(404).json({ ok: false, message: "Gato não encontrado." });
        }

        if (!Array.isArray(cat.comments)) {
            cat.comments = [];
        }

        const commentIndex = cat.comments.findIndex((item) => item.id === commentId);
        if (commentIndex === -1) {
            return res.status(404).json({ ok: false, message: "Comentário não encontrado." });
        }

        const comment = cat.comments[commentIndex];
        if (comment.authorEmail !== req.authEmail) {
            return res.status(403).json({ ok: false, message: "Você só pode excluir o seu próprio comentário." });
        }

        cat.comments.splice(commentIndex, 1);
        saveCatsToFile(cats);
        return res.json({ ok: true, message: "Comentário removido!" });
    } catch (error) {
        console.error("Erro ao remover comentário:", error);
        return res.status(500).json({ ok: false, message: "Erro ao remover comentário." });
    }
});
