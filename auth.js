let email = "";

function getAuthSession() {
   const rawSession = localStorage.getItem('authSession');
   if (!rawSession) {
      return null;
   }

   try {
      const data = JSON.parse(rawSession);
      const expiresAt = Number(data.expiresAt ?? data.ExpiresAt ?? 0);
      const sessionEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      const token = typeof data.token === 'string' ? data.token.trim() : '';

      if (!expiresAt || Date.now() > expiresAt || !sessionEmail || !token) {
         localStorage.removeItem('authSession');
         return null;
      }

      return {
         email: sessionEmail,
         token,
         expiresAt
      };
   } catch (error) {
      localStorage.removeItem('authSession');
      return null;
   }
}

function isAuthenticated() {
   return getAuthSession() !== null;
}

function getAuthHeaders() {
   const session = getAuthSession();
   if (!session) {
      return {};
   }

   return {
      Authorization: `Bearer ${session.token}`
   };
}

const existingSession = getAuthSession();
if (existingSession) {
   email = existingSession.email;
}

const sendCode = () => {
   email = document.getElementById('emailInput').value.trim().toLowerCase();

   if (!email) {
      alert('Digite um e-mail válido.');
      return;
   }

   fetch('http://localhost:3000/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
   })
      .then(response => response.json())
      .then(data => {
         if (!data.ok) {
            alert(data.message || 'Não foi possível enviar o código.');
            return;
         }

         if (typeof data.devCode === 'number') {
            const codeInput = document.getElementById('CodeInput');
            codeInput.value = String(data.devCode);
            alert(`${data.message}\nCódigo de teste: ${data.devCode}`);
            return;
         }

         alert(data.message);
      })
      .catch(error => {
         console.error(error);
         alert('Erro ao enviar código.');
      });
}

const validateCode = () => {
   const codeRaw = document.getElementById('CodeInput').value.trim();
   const code = Number(codeRaw);

   if (!email) {
      email = document.getElementById('emailInput').value.trim().toLowerCase();
   }

   if (!email) {
      alert('Digite seu e-mail para validar o código.');
      return;
   }

   if (!Number.isInteger(code)) {
      alert('Digite um código válido.');
      return;
   }

   fetch('http://localhost:3000/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
   })
      .then(response => response.json())
      .then(data => {
         if (!data.ok) {
            alert(data.message || 'Código inválido!');
            return;
         }

         if (typeof data.authToken !== 'string' || typeof data.email !== 'string' || typeof data.expiresAt !== 'number') {
            alert('Resposta de autenticação inválida do servidor.');
            return;
         }

         localStorage.setItem('authSession', JSON.stringify({
            email: data.email,
            token: data.authToken,
            expiresAt: data.expiresAt
         }));

         email = data.email;

         const modal = document.getElementById('modal-1');
         modal.style.display = 'none';
         alert('Login validado com sucesso!');
      })
      .catch(error => {
         console.error(error);
         alert('Erro ao validar código.');
      });
}
