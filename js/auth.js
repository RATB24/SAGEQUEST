import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Mapa global para traducir IDs a nombres de categorías
let categoriasMap = {};

// Observador del estado de autenticación
onAuthStateChanged(auth, async (user) => {
    const navAuthLinks = document.getElementById("nav-auth-links");
    const navUserLinks = document.getElementById("nav-user-links");
    const heroAuthBtns = document.getElementById("hero-auth-btns");
    const btnJugar = document.getElementById("btn-jugar");
    const adminLink = document.getElementById("admin-link");
    const emailDisplay = document.getElementById("user-email-display");

    if (user) {
        // Usuario ha iniciado sesión
        if (navAuthLinks) navAuthLinks.classList.add("d-none");
        if (navUserLinks) navUserLinks.classList.remove("d-none");
        if (heroAuthBtns) heroAuthBtns.classList.add("d-none");
        if (btnJugar) btnJugar.classList.remove("d-none");
        if (emailDisplay) emailDisplay.textContent = user.email;

        // Verificar si es Admin
        let docSnap = await getDoc(doc(db, "usuarios", user.uid));

        // Si el usuario existe en Auth pero NO en Firestore, creamos su perfil base
        if (!docSnap.exists()) {
            await setDoc(doc(db, "usuarios", user.uid), {
                email: user.email,
                rol: "user"
            });
            docSnap = await getDoc(doc(db, "usuarios", user.uid));
        }

        if (docSnap.exists() && docSnap.data().rol === "admin") {
            if (adminLink) adminLink.classList.remove("d-none");
        }

        // Usamos await para asegurar que las categorías carguen antes que la actividad
        await cargarCategoriasHome();
        await cargarActividadUsuario(user.uid);
        await cargarRanking();

    } else {
        // Usuario no está identificado
        if (navAuthLinks) navAuthLinks.classList.remove("d-none");
        if (navUserLinks) navUserLinks.classList.add("d-none");
        if (heroAuthBtns) heroAuthBtns.classList.remove("d-none");
        if (btnJugar) btnJugar.classList.add("d-none");
        
        // Resetear visualización al cerrar sesión
        const catLista = document.getElementById("home-categorias-lista");
        const puntosGlobales = document.getElementById("puntos-globales");
        const listaPartidas = document.getElementById("lista-ultimas-partidas");
        if (catLista) catLista.innerHTML = '<span class="text-muted small">Inicia sesión para ver categorías</span>';
        if (puntosGlobales) puntosGlobales.textContent = "0";
        if (listaPartidas) listaPartidas.innerHTML = "";
    }
});

// Cargar categorías en la tarjeta del Home
const cargarCategoriasHome = async () => {
    const container = document.getElementById("home-categorias-lista");
    if (!container) return;

    try {
        const snapshot = await getDocs(collection(db, "categorias"));
        container.innerHTML = "";
        if (snapshot.empty) {
            container.innerHTML = '<span class="text-muted small">No hay categorías aún</span>';
            return;
        }
        
        categoriasMap = {}; // Limpiar y repoblar mapa
        snapshot.forEach(doc => {
            categoriasMap[doc.id] = doc.data().nombre; // Guardar ID -> Nombre
            const badge = document.createElement("span");
            badge.className = "badge bg-light text-dark border";
            badge.textContent = doc.data().nombre;
            container.appendChild(badge);
        });
    } catch (error) {
        console.error("Error cargando categorías home:", error);
    }
};

// Cargar el puntaje total y las últimas 10 partidas del usuario
const cargarActividadUsuario = async (uid) => {
    const display = document.getElementById("puntos-globales");
    const lista = document.getElementById("lista-ultimas-partidas");
    if (!display) return;

    try {
        // Traemos las partidas del usuario (quitamos el orderBy de la consulta para evitar errores de índice compuesto en Firestore)
        const q = query(collection(db, "partidas"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            display.textContent = "0";
            lista.innerHTML = '<li class="list-group-item text-center text-muted border-0">Aún no tienes partidas registradas</li>';
            return;
        }

        let total = 0;
        const partidas = [];
        lista.innerHTML = "";

        querySnapshot.forEach(doc => {
            const data = doc.data();
            partidas.push(data);
            const pts = !isNaN(data.puntos) ? Number(data.puntos) : 0;
            total += pts;
        });

        // Ordenamos en memoria por fecha descendente (la más reciente primero)
        partidas.sort((a, b) => {
            const dateA = a.fecha && typeof a.fecha.toDate === 'function' ? a.fecha.toDate() : 0;
            const dateB = b.fecha && typeof b.fecha.toDate === 'function' ? b.fecha.toDate() : 0;
            return dateB - dateA;
        });

        display.textContent = total.toLocaleString();

        // Mostramos las últimas 10
        partidas.slice(0, 10).forEach(data => {
            const pts = !isNaN(data.puntos) ? Number(data.puntos) : 0;
            const fechaStr = data.fecha && typeof data.fecha.toDate === 'function' 
                             ? data.fecha.toDate().toLocaleDateString() 
                             : "Reciente";
            
            // Traducir el ID al nombre si es necesario
            const catNombre = categoriasMap[data.categoria] || data.categoria || "General";

            lista.innerHTML += `
                <li class="list-group-item d-flex justify-content-between p-1 border-0">
                    <span class="text-muted small">${fechaStr} - ${catNombre}</span>
                    <span class="fw-bold">+${pts}</span>
                </li>`;
        });
    } catch (error) {
        console.error("Error cargando actividad:", error);
        lista.innerHTML = '<li class="list-group-item text-danger border-0">Error al cargar actividad</li>';
    }
};

// Función para cargar el Top 10 sumando puntos totales por jugador
const cargarRanking = async () => {
    const lista = document.getElementById("lista-ranking");
    if (!lista) return;

    try {
        const querySnapshot = await getDocs(collection(db, "partidas"));
        const totalesPorUsuario = {};

        // Agrupar y sumar puntos por email
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const email = data.email || "Anónimo";
            const pts = !isNaN(data.puntos) ? Number(data.puntos) : 0;

            if (!totalesPorUsuario[email]) {
                totalesPorUsuario[email] = 0;
            }
            totalesPorUsuario[email] += pts;
        });

        // Convertir a array para ordenar
        const rankingArray = Object.keys(totalesPorUsuario).map(email => ({
            nombre: email.split('@')[0],
            puntos: totalesPorUsuario[email]
        }));

        // Ordenar de mayor a menor y tomar el Top 10
        rankingArray.sort((a, b) => b.puntos - a.puntos);
        const top10 = rankingArray.slice(0, 10);

        lista.innerHTML = "";

        if (top10.length === 0) {
            lista.innerHTML = '<li class="list-group-item text-center">Aún no hay puntuaciones registradas</li>';
            return;
        }

        top10.forEach((user, index) => {
            lista.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><strong>#${index + 1}</strong> ${user.nombre}</span>
                    <span class="badge bg-primary rounded-pill">${user.puntos.toLocaleString()} pts</span>
                </li>`;
        });
    } catch (error) {
        console.error("Error al cargar ranking:", error);
        lista.innerHTML = '<li class="list-group-item text-danger text-center">Error al cargar ranking</li>';
    }
};

// Función para cerrar sesión
window.logout = async () => {
    try {
        await signOut(auth);
        await Swal.fire({
            icon: "info",
            title: "Sesión cerrada",
            text: "Has salido del sistema correctamente.",
            timer: 1500,
            showConfirmButton: false
        });
        window.location.reload();
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        Swal.fire({
            icon: "error",
            title: "Ups...",
            text: "No se pudo cerrar la sesión."
        });
    }
};

// Función Global para alternar Modo Oscuro
window.toggleDarkMode = () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};