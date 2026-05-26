const openButtons = document.querySelectorAll('.open-modal');
openButtons.forEach(button => {
    button.addEventListener('click', () => {
        const modalId = button.getAttribute('data-modal');
        const modal = document.getElementById(modalId);

        if (!isAuthenticated()) {
            modal.style.display = 'flex';
        }
    });
});

const closeButtons = document.querySelectorAll('.close-modal');
closeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const modalId = button.getAttribute('data-modal');
        const modal = document.getElementById(modalId);
        modal.style.display = 'none';
    });
});

const btnCadastrarGatinho = document.getElementById('btnCadastrarGatinho');
btnCadastrarGatinho.addEventListener('click', () => {
    const formCadastroGato = document.getElementById('formCadastroGato');
    const modal = document.getElementById('modal-1');

    if (!isAuthenticated()) {
        modal.style.display = 'flex';
        return;
    }

    formCadastroGato.style.display = 'flex';
});

const closeBtnCadastrarGatinho = document.getElementById('ClosebtnCadastrarGatinho');
closeBtnCadastrarGatinho.addEventListener('click', () => {
    const formCadastroGato = document.getElementById('formCadastroGato');
    formCadastroGato.style.display = 'none';
});
