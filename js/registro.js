import { app } from "./firebase-config.js";

import {
 getAuth,
 createUserWithEmailAndPassword
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
 getFirestore, doc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

window.registrar = async()=>{

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        Swal.fire({
            icon: "warning",
            title: "Atención",
            text: "Todos los campos son obligatorios."
        });
        return;
    }

    try{

        const userCredential =
        await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        // Guardar el perfil del usuario en Firestore con rol predeterminado
        await setDoc(doc(db, "usuarios", userCredential.user.uid), {
            email: email,
            rol: "user"
        });

        await Swal.fire({
            icon: "success",
            title: "¡Cuenta creada!",
            text: "Usuario registrado correctamente.",
            timer: 2000,
            showConfirmButton: false
        });
        window.location.href = "login.html";

    }catch(error){
        Swal.fire({
            icon: "error",
            title: "Error al registrar",
            text: error.message
        });
    }
}

window.toggleDarkMode = () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};