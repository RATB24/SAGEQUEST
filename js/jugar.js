import { app } from "./firebase-config.js";
import { getFirestore, collection, getDocs, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const db = getFirestore(app);
const auth = getAuth(app);

let preguntas = [];
let indicePreguntaActual = 0;
let puntos = 0;
let cronometro;
let tiempoRestante = 15;
let usuarioActual = null;

// Elementos de audio
const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

// Diagnóstico de audio
const verificarAudio = (audio, nombre) => {
    if (audio) {
        audio.addEventListener('error', () => {
            console.error(`ERROR 404: No se encontró el archivo de sonido en: ${audio.src}`);
            console.log(`Sugerencia: Verifica que la carpeta se llame 'sounds' y el archivo '${nombre}' existan en la raíz.`);
        });
    }
};
verificarAudio(correctSound, 'correct.mp3');
verificarAudio(incorrectSound, 'incorrect.mp3');

// Verificar sesión
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    usuarioActual = user;
    cargarCategorias();
});

async function cargarCategorias() {
    const select = document.getElementById("select-categoria");
    const snapshot = await getDocs(collection(db, "categorias"));
    snapshot.forEach(doc => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = doc.data().nombre;
        select.appendChild(opt);
    });
}

window.iniciarJuego = async () => {
    const catId = document.getElementById("select-categoria").value;

    // Forzar la carga de audios al primer clic para "despertar" al navegador
    try {
        if (correctSound) await correctSound.load();
        if (incorrectSound) await incorrectSound.load();
    } catch (e) {
        console.warn("Aviso: Los audios no pudieron pre-cargarse, podrían fallar durante el juego.");
    }

    let q;
    
    if (catId === "mixta") {
        q = collection(db, "preguntas");
    } else {
        q = query(collection(db, "preguntas"), where("categoriaId", "==", catId));
    }

    try {
        const snapshot = await getDocs(q);
        const todasLasPreguntas = [];
        snapshot.forEach(doc => todasLasPreguntas.push({ id: doc.id, ...doc.data() }));

        if (todasLasPreguntas.length < 1) {
            return Swal.fire("Atención", "No hay preguntas suficientes en esta categoría.", "warning");
        }

        // Barajar y tomar 10
        preguntas = todasLasPreguntas.sort(() => 0.5 - Math.random()).slice(0, 10);
        
        document.getElementById("setup-container").classList.add("d-none");
        document.getElementById("game-container").classList.remove("d-none");
        mostrarPregunta();
    } catch (error) {
        console.error("Error al obtener preguntas:", error);
        Swal.fire("Error", "No se pudieron cargar las preguntas. Revisa la consola o las reglas de Firestore.", "error");
    }
};

function mostrarPregunta() {
    clearInterval(cronometro);
    if (indicePreguntaActual >= preguntas.length) return terminarJuego();

    const p = preguntas[indicePreguntaActual];
    document.getElementById("info-progreso").textContent = `Pregunta ${indicePreguntaActual + 1} de ${preguntas.length}`;
    document.getElementById("progreso-barra").style.width = `${((indicePreguntaActual + 1) / preguntas.length) * 100}%`;
    document.getElementById("pregunta-texto").textContent = p.enunciado;

    const container = document.getElementById("opciones-container");
    container.innerHTML = "";

    // Barajar opciones
    const opcionesMezcladas = [...p.opciones].sort(() => 0.5 - Math.random());

    opcionesMezcladas.forEach(opcion => {
        const btn = document.createElement("button");
        btn.className = "btn btn-outline-primary btn-lg text-start";
        btn.textContent = opcion;
        btn.onclick = () => validarRespuesta(opcion, p.correcta);
        container.appendChild(btn);
    });

    iniciarCronometro();
}

function iniciarCronometro() {
    tiempoRestante = 15;
    document.getElementById("info-tiempo").textContent = `Tiempo: ${tiempoRestante}s`;
    
    cronometro = setInterval(() => {
        tiempoRestante--;
        document.getElementById("info-tiempo").textContent = `Tiempo: ${tiempoRestante}s`;
        if (tiempoRestante <= 0) {
            clearInterval(cronometro);
            validarRespuesta(null, null); // Tiempo agotado
        }
    }, 1000);
}

function validarRespuesta(seleccionada, correcta) {
    clearInterval(cronometro);
    const botones = document.querySelectorAll("#opciones-container button");
    botones.forEach(b => {
        b.disabled = true;
        b.classList.remove("btn-outline-primary");

        // Resaltar la respuesta correcta siempre
        if (b.textContent === correcta) {
            b.classList.add("btn-success");
        }

        // Si el usuario se equivocó, resaltar su elección en rojo
        if (seleccionada !== correcta && b.textContent === seleccionada) {
            b.classList.add("btn-danger");
        }
    });

    if (seleccionada === correcta && seleccionada !== null) {
        puntos += 10;
        if (correctSound) {
            correctSound.currentTime = 0;
            correctSound.play().catch(e => console.warn("Error al reproducir audio:", e));
        }
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    } else {
        if (incorrectSound) {
            incorrectSound.currentTime = 0;
            incorrectSound.play().catch(e => console.warn("Error al reproducir audio:", e));
        }
    }

    setTimeout(() => {
        indicePreguntaActual++;
        mostrarPregunta();
    }, 1500); // Aumentado a 1.5s para que el jugador vea el feedback
}

async function terminarJuego() {
    document.getElementById("game-container").classList.add("d-none");
    document.getElementById("result-container").classList.remove("d-none");
    document.getElementById("puntaje-final").textContent = `Lograste ${puntos} puntos.`;

    try {
        await addDoc(collection(db, "partidas"), {
            userId: usuarioActual.uid,
            email: usuarioActual.email,
            puntos: puntos,
            categoria: document.getElementById("select-categoria").options[document.getElementById("select-categoria").selectedIndex].text,
            fecha: serverTimestamp()
        });
    } catch (e) {
        console.error("Error al guardar partida:", e);
    }
}

window.toggleDarkMode = () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};