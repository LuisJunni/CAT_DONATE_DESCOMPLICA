function openAuthModal() {
	const modal = document.getElementById('modal-1');
	if (modal) {
		modal.style.display = 'flex';
	}
}

function requireCommentAuth(message) {
	if (isAuthenticated()) {
		return true;
	}

	alert(message);
	openAuthModal();
	return false;
}

function getCommentHeaders() {
	const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
	return {
		'Content-Type': 'application/json',
		...authHeaders
	};
}

function reloadCats() {
	if (typeof window.loadCats === 'function') {
		window.loadCats();
	}
}

document.addEventListener('submit', (event) => {
	const form = event.target;

	if (!(form instanceof HTMLFormElement)) {
		return;
	}

	if (!form.classList.contains('comment-form')) {
		return;
	}

	event.preventDefault();

	if (!requireCommentAuth('Você precisa estar autenticado para comentar.')) {
		return;
	}

	const catId = Number(form.getAttribute('data-cat-id'));
	const input = form.querySelector('.comment-input');
	const text = input ? input.value.trim() : '';

	if (!Number.isInteger(catId)) {
		alert('ID do gato inválido.');
		return;
	}

	if (!text) {
		alert('Digite um comentário antes de enviar.');
		return;
	}

	fetch(`http://localhost:3000/cats/${catId}/comments`, {
		method: 'POST',
		headers: getCommentHeaders(),
		body: JSON.stringify({ text })
	})
		.then((response) => response.json())
		.then((data) => {
			if (!data.ok) {
				alert(data.message || 'Não foi possível comentar.');
				return;
			}

			form.reset();
			reloadCats();
		})
		.catch((error) => {
			console.error(error);
			alert('Erro ao enviar comentário.');
		});
});

document.addEventListener('click', (event) => {
	const target = event.target;

	if (!(target instanceof HTMLElement)) {
		return;
	}

	if (target.classList.contains('comment-edit-btn')) {
		if (!requireCommentAuth('Você precisa estar autenticado para editar comentário.')) {
			return;
		}

		const catId = Number(target.getAttribute('data-cat-id'));
		const commentId = Number(target.getAttribute('data-comment-id'));
		const encodedCurrentText = target.getAttribute('data-comment-text') || '';

		if (!Number.isInteger(catId) || !Number.isInteger(commentId)) {
			alert('IDs inválidos para comentário.');
			return;
		}

		let currentText = '';
		try {
			currentText = decodeURIComponent(encodedCurrentText);
		} catch {
			currentText = '';
		}

		const newText = prompt('Editar comentário:', currentText);
		if (newText === null) {
			return;
		}

		const text = newText.trim();
		if (!text) {
			alert('Comentário não pode ser vazio.');
			return;
		}

		fetch(`http://localhost:3000/cats/${catId}/comments/${commentId}`, {
			method: 'PUT',
			headers: getCommentHeaders(),
			body: JSON.stringify({ text })
		})
			.then((response) => response.json())
			.then((data) => {
				if (!data.ok) {
					alert(data.message || 'Não foi possível editar comentário.');
					return;
				}

				reloadCats();
			})
			.catch((error) => {
				console.error(error);
				alert('Erro ao editar comentário.');
			});

		return;
	}

	if (target.classList.contains('comment-delete-btn')) {
		if (!requireCommentAuth('Você precisa estar autenticado para excluir comentário.')) {
			return;
		}

		const catId = Number(target.getAttribute('data-cat-id'));
		const commentId = Number(target.getAttribute('data-comment-id'));

		if (!Number.isInteger(catId) || !Number.isInteger(commentId)) {
			alert('IDs inválidos para comentário.');
			return;
		}

		const confirmed = confirm('Deseja excluir este comentário?');
		if (!confirmed) {
			return;
		}

		fetch(`http://localhost:3000/cats/${catId}/comments/${commentId}`, {
			method: 'DELETE',
			headers: getCommentHeaders()
		})
			.then((response) => response.json())
			.then((data) => {
				if (!data.ok) {
					alert(data.message || 'Não foi possível excluir comentário.');
					return;
				}

				reloadCats();
			})
			.catch((error) => {
				console.error(error);
				alert('Erro ao excluir comentário.');
			});
	}
});
