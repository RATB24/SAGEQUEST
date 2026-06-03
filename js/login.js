import { app } from "./firebase-config.js";

import {
 getAuth,
 signInWithEmailAndPassword
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const auth = getAuth(app);

window.login = async()=>{

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        Swal.fire({
            icon: "warning",
            title: "Campos vacíos",
            text: "Por favor, ingresa tu correo y contraseña."
        });
        return;
    }

    try{

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        await Swal.fire({
            icon: "success",
            title: "¡Bienvenido!",
            text: "Sesión iniciada correctamente.",
            timer: 1500,
            showConfirmButton: false
        });
        window.location.href = "index.html";

    }catch(error){
        Swal.fire({
            icon: "error",
            title: "Error de acceso",
            text: "Verifica tus credenciales."
        });
    }
}

window.toggleDarkMode = () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};