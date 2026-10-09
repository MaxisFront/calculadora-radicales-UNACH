// ============================================================
// app.js
//   1. Controlador de vistas (navegación por hash)
//   2. Calculadora (teclado, flujo de confirmación y resultados)
//   3. Modal del manual de usuario
// ============================================================


// ============================================================
// 1. CONTROLADOR DE VISTAS
// Cada <section data-vista="nombre"> es una vista y solo se muestra una a la vez.
// La navegación usa el hash de la URL (#inicio, #calculadora, #creditos),
// así que cualquier <a href="#nombre"> funciona sin más JS
// y el botón "atrás" del navegador también.
// Desde otro script: Navegacion.irA('creditos')
// ============================================================
(function () {
  'use strict';

  var VISTA_INICIAL = 'inicio';

  // Objeto { nombre: elemento } con todas las vistas del HTML
  var vistas = {};
  document.querySelectorAll('[data-vista]').forEach(function (seccion) {
    vistas[seccion.dataset.vista] = seccion;
  });

  function leerHash() {
    return window.location.hash.slice(1);
  }

  // Oculta todas las vistas y muestra solo la indicada
  function mostrarVista(nombre, moverFoco) {
    if (!vistas[nombre]) {
      // Hash desconocido: vuelve al inicio
      nombre = VISTA_INICIAL;
      history.replaceState(null, '', '#' + nombre);
    }

    Object.keys(vistas).forEach(function (clave) {
      vistas[clave].hidden = (clave !== nombre);
    });

    document.body.dataset.vistaActual = nombre;
    window.scrollTo(0, 0);

    // Accesibilidad: lleva el foco al título de la vista nueva
    if (moverFoco) {
      var titulo = vistas[nombre].querySelector('h1');
      if (titulo) {
        titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
      }
    }
  }

  function irA(nombre) {
    if (leerHash() === nombre) {
      mostrarVista(nombre, true);
    } else {
      window.location.hash = nombre; // dispara 'hashchange'
    }
  }

  window.addEventListener('hashchange', function () {
    mostrarVista(leerHash(), true);
  });

  // Carga inicial: respeta el hash si ya venía en la URL
  mostrarVista(leerHash() || VISTA_INICIAL, false);

  window.Navegacion = { irA: irA };
})();


// ============================================================
// 2. CALCULADORA
// Flujo: escribir función -> "Revisar función" -> "¿La función es correcta?"
//        -> "Sí, analizar" -> resultados -> "¿Deseas realizar otro cálculo?"
// ============================================================
(function () {
  'use strict';

  var CAMPOS = ['numerador', 'denominador'];

  var entradas = {
    numerador: document.getElementById('entrada-numerador'),
    denominador: document.getElementById('entrada-denominador')
  };
  var etiquetaCampo = document.getElementById('campo-activo');
  var teclado = document.querySelector('.teclado');
  var mensajeError = document.getElementById('mensaje-error');
  var botonRevisar = document.getElementById('boton-revisar');
  var botonAnalizar = document.getElementById('boton-analizar');
  var panelConfirmacion = document.getElementById('confirmacion');
  var textoConfirmacion = document.getElementById('confirmacion-funcion');
  var pasoResultados = document.getElementById('paso-resultados');
  var resultadosVacio = document.getElementById('resultados-vacio');
  var resultadosContenido = document.getElementById('resultados-contenido');

  var estado = { campoActivo: 'numerador' };

  // Solo números, X, + - * / ^ . y paréntesis
  var CARACTERES_VALIDOS = /^[0-9xX+\-*\/^().\s]+$/;

  function esPantallaTactil() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  function prefiereMenosMovimiento() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function alClic(accion, funcion) {
    document.querySelectorAll('[data-accion="' + accion + '"]').forEach(function (elemento) {
      elemento.addEventListener('click', funcion);
    });
  }


  // ------------------------------------------------------------
  // PUENTE ENTRE LA PANTALLA Y EL MOTOR MATEMÁTICO
  // Toda la matemática vive en motor-racional.js (MotorRacional).
  // calculateMath solo le manda los textos y pinta lo que regresa.
  // Devuelve true si se pudo calcular y false si hubo un error.
  // ------------------------------------------------------------
  function calculateMath(numerator, denominator) {
    var analisis = MotorRacional.analizar(numerator, denominator);

    if (!analisis.ok) {
      mostrarError(analisis.error);
      return false;
    }

    mostrarResultados(analisis.texto);
    return true;
  }

  // Escribe cada valor en su celda (la que tiene data-resultado="clave")
  function mostrarResultados(resultados) {
    Object.keys(resultados).forEach(function (clave) {
      var celda = document.querySelector('[data-resultado="' + clave + '"]');
      if (celda) {
        celda.textContent = resultados[clave];
      }
    });
  }


  // ------------------------------------------------------------
  // Campo activo
  // ------------------------------------------------------------
  function activarCampo(nombre) {
    estado.campoActivo = nombre;
    CAMPOS.forEach(function (clave) {
      entradas[clave].classList.toggle('funcion__input--activo', clave === nombre);
    });
    etiquetaCampo.textContent = nombre;
  }

  CAMPOS.forEach(function (nombre) {
    var entrada = entradas[nombre];

    entrada.addEventListener('focus', function () {
      activarCampo(nombre);
    });

    entrada.addEventListener('input', funcionModificada);

    entrada.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        revisarFuncion();
      }
    });
  });


  // ------------------------------------------------------------
  // Teclado virtual
  // ------------------------------------------------------------
  function insertarTexto(campo, texto) {
    campo.setRangeText(texto, campo.selectionStart, campo.selectionEnd, 'end');
  }

  function borrarCaracter(campo) {
    var inicio = campo.selectionStart;
    var fin = campo.selectionEnd;
    if (inicio !== fin) {
      campo.setRangeText('', inicio, fin, 'end');
    } else if (inicio > 0) {
      campo.setRangeText('', inicio - 1, inicio, 'end');
    }
  }

  // Evita que al presionar una tecla el input pierda el foco
  teclado.addEventListener('mousedown', function (evento) {
    if (evento.target.closest('.teclado__tecla')) {
      evento.preventDefault();
    }
  });

  teclado.addEventListener('click', function (evento) {
    var tecla = evento.target.closest('.teclado__tecla');
    if (!tecla) {
      return;
    }

    var campo = entradas[estado.campoActivo];

    if (tecla.dataset.accion === 'limpiar') {
      campo.value = '';
    } else if (tecla.dataset.accion === 'borrar') {
      borrarCaracter(campo);
    } else {
      insertarTexto(campo, tecla.dataset.tecla);
    }

    funcionModificada();

    // En celular no se vuelve a enfocar para que no salga el teclado del sistema
    if (!esPantallaTactil()) {
      campo.focus();
    }
  });


  // ------------------------------------------------------------
  // Mensajes de error
  // ------------------------------------------------------------
  function mostrarError(texto) {
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
  }

  function ocultarError() {
    mensajeError.textContent = '';
    mensajeError.hidden = true;
  }

  // Devuelve { mensaje, campo } si algo está mal, o null si todo está bien
  function validar(numerador, denominador) {
    if (!numerador && !denominador) {
      return { mensaje: 'Escribe el numerador y el denominador antes de revisar la función.', campo: 'numerador' };
    }
    if (!numerador) {
      return { mensaje: 'Falta el numerador. Escríbelo en el campo de arriba.', campo: 'numerador' };
    }
    if (!denominador) {
      return { mensaje: 'Falta el denominador. Escríbelo en el campo de abajo.', campo: 'denominador' };
    }
    if (!CARACTERES_VALIDOS.test(numerador)) {
      return { mensaje: 'El numerador tiene caracteres no válidos. Usa números, X, + - * / ^ y paréntesis.', campo: 'numerador' };
    }
    if (!CARACTERES_VALIDOS.test(denominador)) {
      return { mensaje: 'El denominador tiene caracteres no válidos. Usa números, X, + - * / ^ y paréntesis.', campo: 'denominador' };
    }

    // El motor revisa que sean polinomios bien escritos (paréntesis, exponentes, grado máximo)
    var errorMotor = MotorRacional.validar(numerador, denominador);
    if (errorMotor) {
      return errorMotor;
    }
    return null;
  }


  // ------------------------------------------------------------
  // Estado de la pantalla
  // ------------------------------------------------------------
  function mostrarVacio() {
    resultadosVacio.hidden = false;
    resultadosContenido.hidden = true;
  }

  // Si la función cambia, lo confirmado y los resultados ya no corresponden
  function funcionModificada() {
    ocultarError();
    panelConfirmacion.hidden = true;
    botonRevisar.hidden = false;
    mostrarVacio();
  }

  function reiniciarCalculadora() {
    entradas.numerador.value = '';
    entradas.denominador.value = '';
    funcionModificada();
    activarCampo('numerador');
  }


  // ------------------------------------------------------------
  // Flujo
  // ------------------------------------------------------------
  function revisarFuncion() {
    var numerador = entradas.numerador.value.trim();
    var denominador = entradas.denominador.value.trim();
    var error = validar(numerador, denominador);

    if (error) {
      mostrarError(error.mensaje);
      entradas[error.campo].focus();
      return;
    }

    ocultarError();
    mostrarVacio();
    textoConfirmacion.textContent = 'f(x) = (' + numerador + ') / (' + denominador + ')';
    botonRevisar.hidden = true;
    panelConfirmacion.hidden = false;
    botonAnalizar.focus();
  }

  function editarFuncion() {
    panelConfirmacion.hidden = true;
    botonRevisar.hidden = false;
    entradas[estado.campoActivo].focus();
  }

  function analizarFuncion() {
    var numerador = entradas.numerador.value.trim();
    var denominador = entradas.denominador.value.trim();

    panelConfirmacion.hidden = true;
    if (!calculateMath(numerador, denominador)) {
      botonRevisar.hidden = false;
      return;
    }

    resultadosVacio.hidden = true;
    resultadosContenido.hidden = false;
    pasoResultados.scrollIntoView({
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function otroCalculo() {
    reiniciarCalculadora();
    window.scrollTo({ top: 0, behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
    if (!esPantallaTactil()) {
      entradas.numerador.focus({ preventScroll: true });
    }
  }

  function finalizar() {
    reiniciarCalculadora();
    window.Navegacion.irA('creditos');
  }

  alClic('revisar', revisarFuncion);
  alClic('editar', editarFuncion);
  alClic('analizar', analizarFuncion);
  alClic('otro-calculo', otroCalculo);
  alClic('finalizar', finalizar);

  activarCampo('numerador');
})();


// ============================================================
// 3. MODAL DEL MANUAL
// Usa el <dialog id="manual"> del HTML. Se abre con cualquier elemento
// que tenga data-accion="abrir-manual". Se cierra con la X, con
// "Entendido, comenzar", con la tecla Esc o haciendo clic fuera.
// ============================================================
(function () {
  'use strict';

  var dialogo = document.getElementById('manual');
  var contenedor = dialogo.querySelector('.manual__contenedor');

  function alClic(accion, funcion) {
    document.querySelectorAll('[data-accion="' + accion + '"]').forEach(function (elemento) {
      elemento.addEventListener('click', funcion);
    });
  }

  function abrirManual() {
    dialogo.showModal();
    document.body.classList.add('body--bloqueado');
    contenedor.scrollTop = 0;
  }

  function cerrarManual() {
    dialogo.close();
  }

  // Si se abrió desde la pantalla de inicio, "Entendido, comenzar" abre la calculadora
  function comenzar() {
    cerrarManual();
    if (document.body.dataset.vistaActual === 'inicio') {
      window.Navegacion.irA('calculadora');
    }
  }

  alClic('abrir-manual', abrirManual);
  alClic('cerrar-manual', cerrarManual);
  alClic('comenzar', comenzar);

  // Se dispara al cerrar por cualquier vía (botones, Esc, clic fuera)
  dialogo.addEventListener('close', function () {
    document.body.classList.remove('body--bloqueado');
  });

  // Clic en el fondo oscuro: el evento llega al <dialog> mismo, no a su contenido
  dialogo.addEventListener('click', function (evento) {
    if (evento.target === dialogo) {
      cerrarManual();
    }
  });
})();