import { app } from "./firebase-config.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Mapa para traducir IDs de categorías a Nombres
let categoriasMap = {};

// Cargar categorías en el select y en la lista de gestión
const cargarCategorias = async () => {
    const select = document.getElementById("pre-categoria");
    const filtro = document.getElementById("filtro-categoria-admin");
    const lista = document.getElementById("lista-categorias-admin");
    const querySnapshot = await getDocs(collection(db, "categorias"));
    
    select.innerHTML = '<option value="">Selecciona una categoría...</option>';
    filtro.innerHTML = '<option value="">Todas las categorías</option>';
    lista.innerHTML = "";
    categoriasMap = {};

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        categoriasMap[doc.id] = data.nombre;

        // Poblar select
        select.innerHTML += `<option value="${doc.id}">${data.nombre}</option>`;
        filtro.innerHTML += `<option value="${doc.id}">${data.nombre}</option>`;
        
        // Poblar lista de gestión
        lista.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center p-1">
                ${data.nombre}
                <div>
                    <button class="btn btn-sm btn-outline-primary" onclick="editarCategoria('${doc.id}', '${data.nombre}')">✏️</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria('${doc.id}')">🗑️</button>
                </div>
            </li>`;
    });
};

// Cargar preguntas para gestión
window.cargarPreguntas = async (filtroId = "") => {
    const tbody = document.getElementById("lista-preguntas-admin");
    let q = collection(db, "preguntas");

    if (filtroId) {
        q = query(collection(db, "preguntas"), where("categoriaId", "==", filtroId));
    }

    const querySnapshot = await getDocs(q);
    tbody.innerHTML = "";
    querySnapshot.forEach((doc) => {
        const p = doc.data();
        const nombreCat = categoriasMap[p.categoriaId] || "Sin categoría";
        tbody.innerHTML += `
            <tr>
                <td class="small">${p.enunciado.substring(0, 50)}...</td>
                <td><span class="badge bg-secondary">${nombreCat}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-info" onclick="cargarDatosPregunta('${doc.id}')">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarPregunta('${doc.id}')">Eliminar</button>
                </td>
            </tr>`;
    });
};

// Cargar usuarios registrados en Firestore
const cargarUsuarios = async () => {
    const tbody = document.getElementById("lista-usuarios");
    const querySnapshot = await getDocs(collection(db, "usuarios"));
    tbody.innerHTML = "";
    querySnapshot.forEach((doc) => {
        const user = doc.data();
        tbody.innerHTML += `<tr><td>${user.email}</td><td><span class="badge ${user.rol === 'admin' ? 'bg-danger' : 'bg-primary'}">${user.rol}</span></td></tr>`;
    });
};

// Proteger la página y cargar datos solo si el usuario es administrador
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists() && docSnap.data().rol === "admin") {
            document.getElementById("admin-content").classList.remove("d-none");
            cargarCategorias();
            cargarUsuarios();
            cargarPreguntas();
        } else {
            Swal.fire("Acceso denegado", "No tienes permisos de administrador.", "error").then(() => {
                window.location.href = "index.html";
            });
        }
    } else {
        window.location.href = "login.html";
    }
});

window.crearCategoria = async () => {
    const nombre = document.getElementById("cat-nombre").value.trim();
    if (!nombre) return Swal.fire("Error", "Escribe un nombre", "error");

    try {
        await addDoc(collection(db, "categorias"), { nombre });
        Swal.fire("Éxito", "Categoría creada", "success");
        document.getElementById("cat-nombre").value = "";
        cargarCategorias();
    } catch (e) {
        console.error(e);
        Swal.fire("Error", "No se pudo guardar: " + e.message, "error");
    }
};

window.editarCategoria = async (id, nombreActual) => {
    const { value: nuevoNombre } = await Swal.fire({
        title: 'Editar Categoría',
        input: 'text',
        inputValue: nombreActual,
        showCancelButton: true
    });

    if (nuevoNombre && nuevoNombre !== nombreActual) {
        await updateDoc(doc(db, "categorias", id), { nombre: nuevoNombre });
        cargarCategorias();
    }
};

window.eliminarCategoria = async (id) => {
    // Verificar si hay preguntas asociadas
    const q = query(collection(db, "preguntas"), where("categoriaId", "==", id));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        return Swal.fire({
            icon: 'error',
            title: 'Acción Bloqueada',
            text: 'No puedes eliminar esta categoría porque tiene preguntas asociadas. Elimina o mueve las preguntas primero.'
        });
    }

    const result = await Swal.fire({
        title: '¿Eliminar categoría?',
        text: "Esta acción es irreversible.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        await deleteDoc(doc(db, "categorias", id));
        cargarCategorias();
    }
};

window.crearPregunta = async () => {
    const idEdit = document.getElementById("pregunta-id-edit").value;
    const categoriaId = document.getElementById("pre-categoria").value;
    const enunciado = document.getElementById("pre-enunciado").value.trim();
    const inputsOpciones = document.querySelectorAll(".opcion");
    const opciones = Array.from(inputsOpciones).map(i => i.value.trim());

    if (!categoriaId || !enunciado || opciones.some(op => op === "")) {
        return Swal.fire({
            icon: "warning",
            title: "Campos incompletos",
            text: "Por favor, selecciona una categoría, escribe el enunciado y completa las 4 opciones."
        });
    }

    try {
        const data = {
            categoriaId,
            enunciado,
            opciones,
            correcta: opciones[0] // En este ejemplo la primera siempre es la correcta
        };

        if (idEdit) {
            await updateDoc(doc(db, "preguntas", idEdit), data);
            Swal.fire("Actualizado", "Pregunta modificada con éxito", "success");
        } else {
            await addDoc(collection(db, "preguntas"), data);
            Swal.fire("Éxito", "Pregunta guardada", "success");
        }
        
        cancelarEdicionPregunta();
        cargarPreguntas();
    } catch (e) {
        console.error(e);
        Swal.fire("Error", "No se pudo guardar la pregunta: " + e.message, "error");
    }
};

window.eliminarPregunta = async (id) => {
    if (confirm("¿Seguro que quieres eliminar esta pregunta?")) {
        await deleteDoc(doc(db, "preguntas", id));
        cargarPreguntas();
    }
};

window.cargarDatosPregunta = async (id) => {
    const docSnap = await getDoc(doc(db, "preguntas", id));
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById("pregunta-id-edit").value = id;
        document.getElementById("pre-categoria").value = p.categoriaId;
        document.getElementById("pre-enunciado").value = p.enunciado;
        const inputs = document.querySelectorAll(".opcion");
        p.opciones.forEach((op, i) => inputs[i].value = op);
        
        document.getElementById("titulo-pregunta").textContent = "Editando Pregunta";
        document.getElementById("btn-guardar-pregunta").textContent = "Actualizar Pregunta";
        document.getElementById("btn-cancelar-edit").classList.remove("d-none");
        window.scrollTo(0, 0);
    }
};

window.cancelarEdicionPregunta = () => {
    document.getElementById("pregunta-id-edit").value = "";
    document.getElementById("pre-enunciado").value = "";
    document.querySelectorAll(".opcion").forEach(i => i.value = "");
    document.getElementById("titulo-pregunta").textContent = "Nueva Pregunta";
    document.getElementById("btn-guardar-pregunta").textContent = "Guardar Pregunta";
    document.getElementById("btn-cancelar-edit").classList.add("d-none");
};

window.cargarDatosEjemplo = async () => {
    const confirmacion = await Swal.fire({
        title: '¿Cargar datos de prueba?',
        text: "Se añadirán categorías y preguntas de ejemplo.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, cargar'
    });

    if (!confirmacion.isConfirmed) return;

    const datos = [
        {
            nombre: "Historia",
            preguntas: [
                { enunciado: "¿En qué año se descubrió América?", opciones: ["1492", "1500", "1412", "1488"] },
                { enunciado: "¿Quién fue el primer presidente de EE.UU.?", opciones: ["George Washington", "Abraham Lincoln", "Thomas Jefferson", "John Adams"] },
                { enunciado: "¿Qué civilización construyó las pirámides de Giza?", opciones: ["Egipto", "Roma", "Grecia", "Mesopotamia"] },
                { enunciado: "¿En qué año comenzó la Primera Guerra Mundial?", opciones: ["1914", "1918", "1939", "1912"] },
                { enunciado: "¿Quién fue el líder de la Revolución Rusa en 1917?", opciones: ["Lenin", "Stalin", "Trotsky", "Nicolás II"] },
                { enunciado: "¿Qué ciudad fue dividida por un muro hasta 1989?", opciones: ["Berlín", "Viena", "Praga", "Varsovia"] },
                { enunciado: "¿Cuál fue el nombre de la ruta comercial que unía China con Europa?", opciones: ["Ruta de la Seda", "Ruta de las Especias", "Ruta del Té", "Camino Real"] },
                { enunciado: "¿En qué país nació Adolfo Hitler?", opciones: ["Austria", "Alemania", "Suiza", "Polonia"] },
                { enunciado: "¿Quién descubrió la penicilina?", opciones: ["Alexander Fleming", "Marie Curie", "Louis Pasteur", "Isaac Newton"] },
                { enunciado: "¿Qué país regaló la Estatua de la Libertad a Estados Unidos?", opciones: ["Francia", "Reino Unido", "Italia", "España"] },
                { enunciado: "¿En qué año cayó el Imperio Romano de Occidente?", opciones: ["476", "1453", "395", "800"] },
                { enunciado: "¿Quién escribió 'La Odisea'?", opciones: ["Homero", "Sófocles", "Platón", "Aristóteles"] },
                { enunciado: "¿Quién fue Juana de Arco?", opciones: ["Una heroína francesa", "Una reina inglesa", "Una filósofa griega", "Una exploradora española"] },
                { enunciado: "¿Qué evento marcó el inicio de la Revolución Francesa?", opciones: ["La toma de la Bastilla", "La muerte de Luis XVI", "El ascenso de Napoleón", "El Juramento del Juego de Pelota"] },
                { enunciado: "¿En qué continente se originó la humanidad?", opciones: ["África", "Asia", "Europa", "América"] }
            ]
        },
        {
            nombre: "Ciencia",
            preguntas: [
                { enunciado: "¿Cuál es el símbolo químico del oro?", opciones: ["Au", "Ag", "Fe", "Pb"] },
                { enunciado: "¿Cuál es el planeta más grande del sistema solar?", opciones: ["Júpiter", "Saturno", "Marte", "Tierra"] },
                { enunciado: "¿Cuál es el órgano más grande del cuerpo humano?", opciones: ["La piel", "El hígado", "El corazón", "Los pulmones"] },
                { enunciado: "¿Cuál es la velocidad de la luz aproximadamente?", opciones: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"] },
                { enunciado: "¿Qué gas es el más abundante en la atmósfera terrestre?", opciones: ["Nitrógeno", "Oxígeno", "Argón", "Hidrógeno"] },
                { enunciado: "¿Quién propuso la teoría de la relatividad?", opciones: ["Albert Einstein", "Isaac Newton", "Stephen Hawking", "Galileo Galilei"] },
                { enunciado: "¿Cuál es el PH del agua pura?", opciones: ["7", "5", "0", "14"] },
                { enunciado: "¿A qué temperatura hierve el agua a nivel del mar?", opciones: ["100°C", "90°C", "110°C", "80°C"] },
                { enunciado: "¿Cuál es la unidad de medida de la resistencia eléctrica?", opciones: ["Ohmio", "Voltio", "Amperio", "Vatio"] },
                { enunciado: "¿Cuál es el animal más grande del mundo?", opciones: ["Ballena azul", "Elefante africano", "Tiburón ballena", "Jirafa"] },
                { enunciado: "¿Cuántos elementos hay en la tabla periódica?", opciones: ["118", "100", "120", "115"] },
                { enunciado: "¿Qué planeta es conocido como el 'Planeta Rojo'?", opciones: ["Marte", "Venus", "Saturno", "Mercurio"] },
                { enunciado: "¿Cuál es el componente principal del Sol?", opciones: ["Hidrógeno", "Helio", "Oxígeno", "Carbono"] },
                { enunciado: "¿Quién es considerado el padre de la genética?", opciones: ["Gregor Mendel", "Charles Darwin", "James Watson", "Francis Crick"] },
                { enunciado: "¿Qué parte de la célula contiene el material genético?", opciones: ["Núcleo", "Mitocondria", "Citoplasma", "Ribosoma"] }
            ]
        },
        {
            nombre: "Geografía",
            preguntas: [
                { enunciado: "¿Cuál es el río más largo del mundo?", opciones: ["Amazonas", "Nilo", "Misisipi", "Yangtsé"] },
                { enunciado: "¿En qué continente se encuentra el desierto del Sahara?", opciones: ["África", "Asia", "Oceanía", "América"] },
                { enunciado: "¿Cuál es la capital de Italia?", opciones: ["Roma", "Milán", "Venecia", "Florencia"] },
                { enunciado: "¿Cuál es el país más grande del mundo por área?", opciones: ["Rusia", "Canadá", "China", "EE.UU."] },
                { enunciado: "¿Qué océano baña las costas de Brasil?", opciones: ["Atlántico", "Pacífico", "Índico", "Ártico"] },
                { enunciado: "¿Cuál es la montaña más alta del mundo?", opciones: ["Everest", "K2", "Kangchenjunga", "Lhotse"] },
                { enunciado: "¿En qué país se encuentra la Torre Eiffel?", opciones: ["Francia", "España", "Italia", "Alemania"] },
                { enunciado: "¿Cuál es el país más poblado del mundo?", opciones: ["India", "China", "EE.UU.", "Indonesia"] },
                { enunciado: "¿Qué país tiene forma de bota?", opciones: ["Italia", "Grecia", "España", "Portugal"] },
                { enunciado: "¿Cuál es la capital de Japón?", opciones: ["Tokio", "Kioto", "Osaka", "Hiroshima"] },
                { enunciado: "¿En qué continente está Australia?", opciones: ["Oceanía", "Asia", "Antártida", "África"] },
                { enunciado: "¿Cuál es el lago más profundo del mundo?", opciones: ["Baikal", "Victoria", "Superior", "Tanganica"] },
                { enunciado: "¿Qué estrecho separa España de África?", opciones: ["Estrecho de Gibraltar", "Estrecho de Magallanes", "Canal de la Mancha", "Estrecho de Bering"] },
                { enunciado: "¿Cuál es la capital de Argentina?", opciones: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza"] },
                { enunciado: "¿En qué país se encuentran las ruinas de Machu Picchu?", opciones: ["Perú", "Bolivia", "Ecuador", "Colombia"] }
            ]
        },
        {
            nombre: "Deportes",
            preguntas: [
                { enunciado: "¿Cuántos jugadores tiene un equipo de fútbol en el campo?", opciones: ["11", "10", "12", "9"] },
                { enunciado: "¿Cada cuántos años se celebran los Juegos Olímpicos?", opciones: ["4", "2", "5", "3"] },
                { enunciado: "¿En qué deporte destaca Rafael Nadal?", opciones: ["Tenis", "Golf", "Fútbol", "Baloncesto"] },
                { enunciado: "¿Cuál es el estilo de natación más rápido?", opciones: ["Crol", "Mariposa", "Espalda", "Braza"] },
                { enunciado: "¿En qué ciudad se celebraron los primeros Juegos Olímpicos modernos?", opciones: ["Atenas", "Roma", "París", "Londres"] },
                { enunciado: "¿Quién es considerado el mejor jugador de baloncesto de todos los tiempos?", opciones: ["Michael Jordan", "LeBron James", "Kobe Bryant", "Magic Johnson"] },
                { enunciado: "¿Qué selección ha ganado más Mundiales de Fútbol?", opciones: ["Brasil", "Alemania", "Italia", "Argentina"] },
                { enunciado: "¿Cómo se llama el campo de juego en el béisbol?", opciones: ["Diamante", "Cancha", "Pista", "Rectángulo"] },
                { enunciado: "¿En qué país se inventó el voleibol?", opciones: ["Estados Unidos", "Canadá", "Francia", "Alemania"] },
                { enunciado: "¿Cuántos puntos vale un tiro libre en baloncesto?", opciones: ["1", "2", "3", "0"] },
                { enunciado: "¿Cuál es la duración de un partido de fútbol profesional?", opciones: ["90 minutos", "80 minutos", "100 minutos", "70 minutos"] },
                { enunciado: "¿En qué deporte se usa un 'puck' o disco?", opciones: ["Hockey sobre hielo", "Polo", "Lacrosse", "Curling"] },
                { enunciado: "¿Quién ostenta el récord de más medallas olímpicas de oro?", opciones: ["Michael Phelps", "Usain Bolt", "Carl Lewis", "Mark Spitz"] },
                { enunciado: "¿Cuál es la distancia de un maratón?", opciones: ["42.195 km", "40 km", "45 km", "21 km"] },
                { enunciado: "¿En qué deporte se compite por el Tour de Francia?", opciones: ["Ciclismo", "Automovilismo", "Motociclismo", "Atletismo"] }
            ]
        }
    ];

    try {
        for (const cat of datos) {
            const catRef = await addDoc(collection(db, "categorias"), { nombre: cat.nombre });
            for (const pre of cat.preguntas) {
                await addDoc(collection(db, "preguntas"), { 
                    ...pre, 
                    categoriaId: catRef.id,
                    correcta: pre.opciones[0] 
                });
            }
        }
        Swal.fire("Éxito", "Datos cargados correctamente", "success");
        cargarCategorias();
        cargarPreguntas();
    } catch (e) {
        Swal.fire("Error", "Error al cargar datos: " + e.message, "error");
    }
};

window.toggleDarkMode = () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};