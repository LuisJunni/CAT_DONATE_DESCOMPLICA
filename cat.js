const catForm = document.getElementById('gatoForm');
const listaGatos = document.getElementById('listaGatos');
const formCadastroGato = document.getElementById('formCadastroGato');
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
let currentCats = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function openAuthModal() {
  const modal = document.getElementById('modal-1');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function requireCatAuth(message) {
  if (isAuthenticated()) {
    return true;
  }

  alert(message);
  openAuthModal();
  return false;
}

function getJsonHeaders() {
  const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
  return {
    'Content-Type': 'application/json',
    ...authHeaders
  };
}

function renderComments(comments, catId) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '<p>Sem comentários ainda.</p>';
  }

  return comments
    .map((comment) => {
      const commentText = typeof comment.text === 'string' ? comment.text : '';
      const encodedText = encodeURIComponent(commentText);

      return `
        <div class="comment-item" data-comment-id="${comment.id}">
          <p>${escapeHtml(commentText)}</p>
          ${comment.canManage
            ? `<div class="actions-row">
            <button type="button" class="btnComentar comment-edit-btn" data-cat-id="${catId}" data-comment-id="${comment.id}" data-comment-text="${encodedText}">
              Editar comentário
            </button>
            <button type="button" class="btnComentar comment-delete-btn" data-cat-id="${catId}" data-comment-id="${comment.id}">
              Excluir comentário
            </button>
          </div>`
            : ''}
        </div>
      `;
    })
    .join('');
}

function renderCatCard(cat) {
  const nome = escapeHtml(cat.nome || 'Sem nome');
  const cor = escapeHtml(cat.cor || '-');
  const genero = escapeHtml(cat.genero || '-');
  const cidade = escapeHtml(cat.cidade || '-');
  const descricao = escapeHtml(cat.descricao || '');
  const fotoHtml = typeof cat.foto === 'string' && cat.foto.startsWith('data:image/')
    ? `<img src="${cat.foto}" alt="Foto do ${nome}">`
    : '';
  const commentsHtml = renderComments(cat.comments, cat.id);
  const catActionsHtml = cat.canManage
    ? `<div class="actions-row cat-actions">
        <button type="button" class="btnComentar cat-edit-btn" data-cat-id="${cat.id}">Editar gato</button>
        <button type="button" class="btnComentar cat-delete-btn" data-cat-id="${cat.id}">Excluir gato</button>
      </div>`
    : '';

  return `
    <div class="gato" data-cat-id="${cat.id}">
      ${fotoHtml}
      <p><strong>${nome}</strong></p>
      <p>Cor: ${cor}</p>
      <p>Gênero: ${genero}</p>
      <p>Cidade: ${cidade}</p>
      <p>${descricao}</p>

      <div class="comentarios">
        ${commentsHtml}
      </div>

      ${catActionsHtml}

      <form class="comment-form" data-cat-id="${cat.id}">
        <input type="text" class="comment-input" placeholder="Escreva um comentário" required>
        <button type="submit" class="btnComentar">Comentar</button>
      </form>
    </div>
  `;
}

function loadCats() {
  fetch('http://localhost:3000/cats', {
    method: 'GET',
    headers: getJsonHeaders()
  })
    .then(response => response.json())
    .then(data => {
      currentCats = Array.isArray(data.cats) ? data.cats : [];
      listaGatos.innerHTML = '<h2>Gatos</h2>';

      if (!data.ok || !Array.isArray(data.cats) || data.cats.length === 0) {
        listaGatos.insertAdjacentHTML('beforeend', '<p>Nenhum gatinho cadastrado ainda.</p>');
        return;
      }

      data.cats.forEach(cat => {
        const card = renderCatCard(cat);
        listaGatos.insertAdjacentHTML('beforeend', card);
      });
    })
    .catch(error => {
      console.error(error);
    });
}

function requestTextUpdate(label, currentValue, required = false) {
  const answer = prompt(label, currentValue ?? '');

  if (answer === null) {
    return null;
  }

  const value = answer.trim();
  if (required && !value) {
    alert('Esse campo é obrigatório.');
    return null;
  }

  return value;
}

function handleEditCat(catId) {
  if (!requireCatAuth('Você precisa estar autenticado para editar um gatinho.')) {
    return;
  }

  const cat = currentCats.find((item) => item.id === catId);
  if (!cat) {
    alert('Gatinho não encontrado. Atualize a lista.');
    return;
  }

  if (!cat.canManage) {
    alert('Você só pode editar as suas próprias postagens.');
    return;
  }

  const nome = requestTextUpdate('Nome do gato:', cat.nome, true);
  if (nome === null) {
    return;
  }

  const cor = requestTextUpdate('Cor:', cat.cor, true);
  if (cor === null) {
    return;
  }

  const genero = requestTextUpdate('Gênero (macho/femea):', cat.genero || '', false);
  if (genero === null) {
    return;
  }

  const cidade = requestTextUpdate('Cidade:', cat.cidade, true);
  if (cidade === null) {
    return;
  }

  const descricao = requestTextUpdate('Descrição:', cat.descricao || '', false);
  if (descricao === null) {
    return;
  }

  const payload = { nome, cor, genero, cidade, descricao };

  if (cat.foto) {
    const removeFoto = confirm('Deseja remover a foto atual? Clique OK para remover ou Cancelar para manter.');
    if (removeFoto) {
      payload.foto = null;
    }
  }

  fetch(`http://localhost:3000/cats/${catId}`, {
    method: 'PUT',
    headers: getJsonHeaders(),
    body: JSON.stringify(payload)
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.ok) {
        alert(data.message || 'Não foi possível atualizar o gatinho.');
        return;
      }

      loadCats();
    })
    .catch((error) => {
      console.error(error);
      alert('Erro ao atualizar gatinho.');
    });
}

function handleDeleteCat(catId) {
  if (!requireCatAuth('Você precisa estar autenticado para excluir um gatinho.')) {
    return;
  }

  const cat = currentCats.find((item) => item.id === catId);
  if (!cat || !cat.canManage) {
    alert('Você só pode excluir as suas próprias postagens.');
    return;
  }

  const confirmed = confirm('Tem certeza que deseja excluir este gatinho?');
  if (!confirmed) {
    return;
  }

  fetch(`http://localhost:3000/cats/${catId}`, {
    method: 'DELETE',
    headers: getJsonHeaders()
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.ok) {
        alert(data.message || 'Não foi possível excluir o gatinho.');
        return;
      }

      loadCats();
    })
    .catch((error) => {
      console.error(error);
      alert('Erro ao excluir gatinho.');
    });
}

listaGatos.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.classList.contains('cat-edit-btn')) {
    const catId = Number(target.getAttribute('data-cat-id'));
    if (!Number.isInteger(catId)) {
      alert('ID do gato inválido.');
      return;
    }

    handleEditCat(catId);
    return;
  }

  if (target.classList.contains('cat-delete-btn')) {
    const catId = Number(target.getAttribute('data-cat-id'));
    if (!Number.isInteger(catId)) {
      alert('ID do gato inválido.');
      return;
    }

    handleDeleteCat(catId);
  }
});

catForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!requireCatAuth('Você precisa estar autenticado para cadastrar um gatinho.')) {
    return;
  }

  const nome = document.getElementById('nomeGato').value.trim();
  const cor = document.getElementById('corGato').value.trim();
  const genero = document.getElementById('generoGato').value;
  const cidade = document.getElementById('cidadeGato').value.trim();
  const descricao = document.getElementById('descricaoGato').value.trim();
  const fotoInput = document.getElementById('fotoGato');
  const fotoArquivo = fotoInput.files && fotoInput.files[0] ? fotoInput.files[0] : null;

  let foto = null;
  if (fotoArquivo) {
    if (fotoArquivo.size > MAX_IMAGE_SIZE_BYTES) {
      alert('A foto deve ter no máximo 2MB.');
      return;
    }

    try {
      foto = await readFileAsDataUrl(fotoArquivo);
    } catch (error) {
      console.error(error);
      alert('Não foi possível ler a foto selecionada.');
      return;
    }
  }

  fetch('http://localhost:3000/cats', {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ nome, cor, genero, cidade, descricao, foto })
  })
    .then(response => response.json())
    .then(data => {
      if (!data.ok) {
        alert(data.message || 'Não foi possível cadastrar o gatinho.');
        return;
      }

      catForm.reset();
      formCadastroGato.style.display = 'none';
      loadCats();
    })
    .catch(error => {
      console.error(error);
      alert('Erro ao cadastrar gatinho.');
    });
});

window.loadCats = loadCats;
loadCats();