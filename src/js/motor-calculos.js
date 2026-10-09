/* =====================================================================
   motor-racional.js  -  Motor matemático de la calculadora
   =====================================================================

   ¿QUÉ HACE ESTE ARCHIVO?
   Recibe dos textos: el numerador y el denominador de una función racional

            f(x) = numerador / denominador        (ejemplo: "x^2-1" y "x-1")

   y calcula: ordenada al origen, raíces, asíntota vertical, asíntota
   horizontal, asíntota oblicua, hueco, dominio y rango.

   ¿CÓMO SE USA?
        var resultado = MotorRacional.analizar('x^2-1', 'x-1');

        resultado.ok      -> true si todo salió bien, false si el texto tiene un error
        resultado.error   -> (solo si ok es false) mensaje listo para mostrar al usuario
        resultado.texto   -> textos listos para la pantalla (las claves coinciden con
                             los data-resultado del HTML):
                               ordenada, raiz, asintotaVertical, asintotaHorizontal,
                               hueco, dominio, rango, asintotaOblicua
        resultado.datos   -> los mismos resultados pero como números (por si se
                             quieren usar en una gráfica o en pruebas)

        MotorRacional.validar('x^2-1', 'x-1')
             -> null si los textos están bien, o { mensaje, campo } si hay un error.

   MAPA DEL ARCHIVO (se lee de arriba hacia abajo)
        PASO 1  Polinomios como listas de números (y sus operaciones)
        PASO 2  El parser: convierte el texto "x^2-1" en la lista [-1, 0, 1]
        PASO 3  Cómo se encuentran las raíces de un polinomio
        PASO 4  Las propiedades de la función (cada una con su teoría)
        PASO 5  El rango (la parte más larga; usa derivadas y límites)
        PASO 6  Cómo se convierten los números en texto
        PASO 7  analizar(): junta todo lo anterior

   LA IDEA GENERAL EN 6 LÍNEAS
        1. Se convierten los textos en polinomios (listas de coeficientes).
        2. Se buscan los factores comunes entre numerador y denominador
           (máximo común divisor). Esos factores son los HUECOS.
        3. Se simplifica la fracción quitando ese factor común.
        4. Con la fracción simplificada se sacan las asíntotas verticales.
        5. Con los grados de los polinomios se sacan la horizontal y la oblicua.
        6. Con derivadas y límites se saca el rango.

   LÍMITES DE ESTE MOTOR (alcance académico)
        - Numerador y denominador: polinomios de grado 0 a 4 (MAX_GRADO).
        - Solo se buscan raíces REALES (las complejas se ignoran).
        - Los cálculos usan decimales de la computadora, así que se redondea
          a 9 decimales para quitar ruido (por ejemplo 0.9999999999 -> 1).
   ===================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------
  // CONSTANTES (si algo hay que ajustar, se cambia aquí)
  // ---------------------------------------------------------------
  var MAX_GRADO = 4;       // grado más alto permitido en numerador y denominador
  var EPS = 1e-7;          // "casi cero": si un número es menor que esto, lo tratamos como 0
  var CERCA = 1e-6;        // dos números más cerca que esto los tratamos como el mismo
  var DECIMALES = 3;       // decimales que se muestran en pantalla


  /* ===================================================================
     PASO 1 · POLINOMIOS COMO LISTAS DE NÚMEROS
     ===================================================================

     Un polinomio se guarda como una lista (arreglo) de coeficientes.
     La posición en la lista es el exponente de x:

            posición:    0     1     2     3
            término:    n°    x    x²    x³

        x^2 - 1        ->  [-1, 0, 1]       (-1 + 0x + 1x²)
        3x + 6         ->  [6, 3]
        2x^3 - x + 4   ->  [4, -1, 0, 2]
        7              ->  [7]
        0              ->  [0]              (el "polinomio cero")

     El GRADO es el exponente más alto = (largo de la lista) - 1.
     El COEFICIENTE PRINCIPAL es el último número de la lista.
     =================================================================== */

  // Redondea a 9 decimales para quitar el "ruido" de la computadora.
  // Ejemplo: 0.30000000000000004 -> 0.3  |  -0 -> 0
  function limpiarNumero(x) {
    var r = Math.round(x * 1e9) / 1e9;
    return r === 0 ? 0 : r;
  }

  // Deja el polinomio "bonito": limpia el ruido y quita los ceros del final.
  // Ejemplo: [1, 2, 0, 0] -> [1, 2]      (el 0x² y el 0x³ no sirven de nada)
  function normalizar(p) {
    var r = p.map(limpiarNumero);
    while (r.length > 1 && r[r.length - 1] === 0) {
      r.pop();
    }
    return r.length === 0 ? [0] : r;
  }

  function grado(p) {
    return p.length - 1;
  }

  function esCero(p) {
    return p.length === 1 && p[0] === 0;
  }

  // Suma término a término.  (x+1) + (x²-1)  ->  [1,1] + [-1,0,1] = [0,1,1]
  function sumar(a, b) {
    var largo = Math.max(a.length, b.length);
    var r = [];
    for (var i = 0; i < largo; i++) {
      r.push((a[i] || 0) + (b[i] || 0));
    }
    return normalizar(r);
  }

  function restar(a, b) {
    return sumar(a, multiplicarPorNumero(b, -1));
  }

  // Multiplica cada coeficiente por un número.  3 * (x+2) = 3x + 6
  function multiplicarPorNumero(p, k) {
    return normalizar(p.map(function (c) { return c * k; }));
  }

  // Multiplicación de polinomios: "todos con todos".
  // Cada término a[i]·x^i se multiplica por cada término b[j]·x^j
  // y el resultado cae en la posición i + j (porque x^i · x^j = x^(i+j)).
  // Ejemplo: (x+1)(x-1)  ->  [1,1] · [-1,1]  ->  [-1, 0, 1]  ->  x² - 1
  function multiplicar(a, b) {
    var r = [];
    for (var k = 0; k < a.length + b.length - 1; k++) {
      r.push(0);
    }
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        r[i + j] += a[i] * b[j];
      }
    }
    return normalizar(r);
  }

  // Potencia entera: se multiplica el polinomio por sí mismo n veces.
  // Ejemplo: (x+1)^2 = (x+1)(x+1) = x² + 2x + 1
  function elevar(p, n) {
    var r = [1];
    for (var i = 0; i < n; i++) {
      r = multiplicar(r, p);
    }
    return r;
  }

  // Evalúa el polinomio en un valor de x usando el MÉTODO DE HORNER.
  // Idea: ax³ + bx² + cx + d  se escribe como  ((a·x + b)·x + c)·x + d
  // así solo se hacen multiplicaciones y sumas, de una en una.
  // Ejemplo: x² - 1 en x = 3  ->  (1·3 + 0)·3 + (-1) = 8
  function evaluar(p, x) {
    var r = 0;
    for (var i = p.length - 1; i >= 0; i--) {
      r = r * x + p[i];
    }
    return r;
  }

  // DERIVADA de un polinomio: cada término a·x^n se convierte en n·a·x^(n-1).
  // Ejemplo: 2x³ - x + 4  ->  6x² - 1     ([4,-1,0,2] -> [-1,0,6])
  function derivar(p) {
    if (p.length === 1) {
      return [0];
    }
    var r = [];
    for (var i = 1; i < p.length; i++) {
      r.push(i * p[i]);
    }
    return normalizar(r);
  }

  // DIVISIÓN LARGA de polinomios (la misma que se hace en el cuaderno):
  //     dividendo = divisor · cociente + residuo      (grado del residuo < grado del divisor)
  // Ejemplo: (x² - 1) ÷ (x - 1)  ->  cociente x + 1, residuo 0
  //
  // Cómo lo hace el código, de arriba hacia abajo:
  //   1. Se toma el término más alto del dividendo y se divide entre el término
  //      más alto del divisor. Eso da un término del cociente.
  //   2. Se multiplica ese término por todo el divisor y se RESTA al dividendo.
  //   3. Se repite hasta que el grado que queda sea menor que el del divisor.
  function dividir(dividendo, divisor) {
    if (esCero(divisor)) {
      throw new Error('División entre el polinomio cero.');
    }
    var gDivisor = grado(divisor);
    var principal = divisor[gDivisor];
    var residuo = dividendo.slice();
    var cociente = [];
    var gCociente = Math.max(0, grado(dividendo) - gDivisor);
    for (var k = 0; k <= gCociente; k++) {
      cociente.push(0);
    }

    for (var i = grado(dividendo); i >= gDivisor; i--) {
      var factor = residuo[i] / principal;      // paso 1
      cociente[i - gDivisor] = factor;
      for (var j = 0; j <= gDivisor; j++) {     // paso 2
        residuo[i - gDivisor + j] -= factor * divisor[j];
      }
      residuo[i] = 0;
    }
    return { cociente: normalizar(cociente), residuo: normalizar(residuo) };
  }

  // Divide todo el polinomio entre su coeficiente principal para que el
  // coeficiente principal quede en 1 (se llama polinomio "mónico").
  // Ejemplo: 2x - 4  ->  x - 2
  function hacerMonico(p) {
    return multiplicarPorNumero(p, 1 / p[grado(p)]);
  }

  // MÁXIMO COMÚN DIVISOR de dos polinomios (ALGORITMO DE EUCLIDES).
  // Es el polinomio más grande que divide exactamente a los dos: su FACTOR COMÚN.
  //
  // Teoría: mcd(a, b) = mcd(b, residuo de a ÷ b). Se repite hasta que el
  // residuo es 0; el último divisor es el mcd.
  //
  // Ejemplo con (x² - 1) y (x - 1):
  //   (x² - 1) ÷ (x - 1) deja residuo 0  ->  el mcd es (x - 1).
  //   Es decir, x - 1 es factor de los dos  ->  habrá un HUECO en x = 1.
  //
  // Si no hay factor común el resultado es [1] (el polinomio constante 1).
  //
  // Ojo con los decimales: la computadora no guarda las fracciones exactas,
  // así que un residuo que "debería ser 0" puede salir como 0.0000000003.
  // Por eso, dentro del algoritmo NO se redondea (para no perder precisión)
  // y se considera 0 cualquier residuo cuyos coeficientes sean diminutos
  // comparados con el tamaño de los polinomios originales.
  function mcd(a, b) {
    var escala = Math.max(1, maxCoeficiente(a), maxCoeficiente(b));
    while (!esCasiCero(b, escala)) {
      var residuo = residuoSinRedondear(a, b, escala);
      a = b;
      b = residuo;
    }
    // Se divide entre el coeficiente principal para dejarlo mónico (principal = 1)
    var principal = a[a.length - 1];
    return normalizar(a.map(function (c) { return c / principal; }));
  }

  // Residuo de la división larga a ÷ b, igual que en dividir() pero sin redondear.
  // Al final se descartan los términos de arriba que quedaron "casi cero".
  function residuoSinRedondear(a, b, escala) {
    var residuo = a.slice();
    var gB = b.length - 1;
    for (var i = residuo.length - 1; i >= gB; i--) {
      var factor = residuo[i] / b[gB];
      for (var j = 0; j <= gB; j++) {
        residuo[i - gB + j] -= factor * b[j];
      }
    }
    residuo = residuo.slice(0, Math.max(gB, 1));     // el residuo tiene grado menor que b
    while (residuo.length > 1 && Math.abs(residuo[residuo.length - 1]) <= 1e-9 * escala) {
      residuo.pop();
    }
    return residuo;
  }

  function maxCoeficiente(p) {
    return Math.max.apply(null, p.map(Math.abs));
  }

  // ¿Todos los coeficientes son diminutos (menos de 0.0000001 veces la escala)?
  function esCasiCero(p, escala) {
    return maxCoeficiente(p) <= 1e-7 * escala;
  }


  /* ===================================================================
     PASO 2 · EL PARSER (de texto a polinomio)
     ===================================================================

     Un PARSER lee un texto de izquierda a derecha y lo convierte en algo que
     la computadora puede calcular. Este parser sigue las mismas reglas de
     orden de operaciones que en matemáticas, con cuatro funciones que se
     llaman unas a otras (de lo MENOS prioritario a lo MÁS prioritario):

        expresion()  ->  sumas y restas               x^2 - 1 + 3x
        termino()    ->  multiplicaciones y divisiones 2x * (x+1)   ó   x/2
        factor()     ->  el signo de adelante          -x
        potencia()   ->  el exponente                  x^2   ó   (x+1)^2
        primario()   ->  lo más básico: número, x o (algo entre paréntesis)

     Como "expresion" llama a "termino" y "termino" llama a "factor", etc., lo
     que va más abajo se calcula primero (igual que la potencia se hace antes
     que la multiplicación y la multiplicación antes que la suma).

     Cada función ya devuelve un POLINOMIO (lista de coeficientes), así que no
     hace falta "extraer coeficientes" al final: se van armando solos.

     Cosas que acepta:   x^2-1   2X^3-x+4   3(x+2)   (x+1)(x-1)   2x(x+1)
                         (x+1)^2   x/2   0.5x   -x^2+3
     Multiplicación implícita: "2x", "x(x+1)" y ")(" significan multiplicar.
     =================================================================== */

  // Crea un error con el mensaje listo para el usuario.
  // "nombre" es 'numerador' o 'denominador' y se guarda en e.campo para que la
  // pantalla sepa en qué campo poner el cursor.
  function errorDe(nombre, mensaje) {
    var etiqueta = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    var e = new Error(etiqueta + ': ' + mensaje);
    e.campo = nombre;
    return e;
  }

  // Convierte un texto en polinomio. Si el texto está mal escrito lanza un error.
  // Ejemplo: leerPolinomio('x^2-1', 'numerador')  ->  [-1, 0, 1]
  function leerPolinomio(texto, nombre) {
    // Se quitan espacios y se pasa todo a minúsculas (X y x son lo mismo)
    var cadena = String(texto).replace(/\s+/g, '').toLowerCase();
    var pos = 0;   // posición del carácter que se está leyendo

    function fallo(mensaje) {
      return errorDe(nombre, mensaje);
    }

    function actual() {
      return cadena.charAt(pos);     // '' cuando ya se acabó el texto
    }

    function esDigito(c) {
      return c >= '0' && c <= '9';
    }

    // --- Lee un número: "12", "3.5", ".5" ---
    function leerNumero() {
      var inicio = pos;
      var puntos = 0;
      while (esDigito(actual()) || actual() === '.') {
        if (actual() === '.') {
          puntos++;
        }
        pos++;
      }
      var numero = cadena.slice(inicio, pos);
      if (puntos > 1 || numero === '.') {
        throw fallo('hay un número mal escrito ("' + numero + '").');
      }
      return parseFloat(numero);
    }

    // --- Lee el exponente que va después de ^ (solo enteros de 0 a MAX_GRADO) ---
    function leerExponente() {
      var inicio = pos;
      while (esDigito(actual())) {
        pos++;
      }
      var numero = cadena.slice(inicio, pos);
      var valido = numero !== '' && actual() !== '.' && parseInt(numero, 10) <= MAX_GRADO;
      if (!valido) {
        throw fallo('el exponente debe ser un entero de 0 a ' + MAX_GRADO + ' (por ejemplo X^2).');
      }
      return parseInt(numero, 10);
    }

    // --- Nivel 1: lo más básico ---
    //   un número  -> polinomio constante      "5"   -> [5]
    //   la letra x -> el polinomio x           "x"   -> [0, 1]
    //   (algo)     -> se calcula lo de adentro
    function primario() {
      var c = actual();
      if (c === '(') {
        pos++;
        var dentro = expresion();          // se vuelve a empezar desde cero adentro
        if (actual() !== ')') {
          throw fallo('falta cerrar un paréntesis.');
        }
        pos++;
        return dentro;
      }
      if (c === 'x') {
        pos++;
        return [0, 1];
      }
      if (esDigito(c) || c === '.') {
        return [leerNumero()];
      }
      if (c === '') {
        throw fallo('la expresión está incompleta (falta algo al final).');
      }
      throw fallo('no entendí "' + c + '". Usa números, X, + - * / ^ y paréntesis.');
    }

    // --- Nivel 2: exponente.  base^n  ->  la base multiplicada n veces ---
    function potencia() {
      var base = primario();
      if (actual() === '^') {
        pos++;
        base = elevar(base, leerExponente());
      }
      return base;
    }

    // --- Nivel 3: signo de adelante.  -x^2 significa -(x^2) ---
    function factor() {
      if (actual() === '-') {
        pos++;
        return multiplicarPorNumero(factor(), -1);
      }
      if (actual() === '+') {
        pos++;
        return factor();
      }
      return potencia();
    }

    // Dividir entre un número es multiplicar por su inverso: x/2 = 0.5x.
    // Dividir entre x NO da un polinomio, por eso no se permite.
    function dividirEntreNumero(p, divisor) {
      if (grado(divisor) !== 0) {
        throw fallo('solo se puede dividir entre números, no entre X. La fracción principal ya es la división.');
      }
      if (divisor[0] === 0) {
        throw fallo('no se puede dividir entre 0.');
      }
      return multiplicarPorNumero(p, 1 / divisor[0]);
    }

    // --- Nivel 4: multiplicaciones y divisiones ---
    function termino() {
      var resultado = factor();
      while (true) {
        var c = actual();
        if (c === '*') {
          pos++;
          resultado = multiplicar(resultado, factor());
        } else if (c === '/') {
          pos++;
          resultado = dividirEntreNumero(resultado, factor());
        } else if (c === '(' || c === 'x' || esDigito(c) || c === '.') {
          // Multiplicación implícita: "2x", "x(x+1)", "(x+1)(x-1)"
          resultado = multiplicar(resultado, factor());
        } else {
          return resultado;
        }
      }
    }

    // --- Nivel 5: sumas y restas ---
    function expresion() {
      var resultado = termino();
      while (actual() === '+' || actual() === '-') {
        var operador = actual();
        pos++;
        var siguiente = termino();
        resultado = (operador === '+') ? sumar(resultado, siguiente) : restar(resultado, siguiente);
      }
      return resultado;
    }

    // ----- Aquí empieza a trabajar el parser -----
    if (cadena === '') {
      throw fallo('escribe una expresión.');
    }

    var polinomio = expresion();

    // Si sobró texto sin leer es porque algo estaba mal escrito
    if (pos < cadena.length) {
      if (actual() === ')') {
        throw fallo('hay un paréntesis ")" de más.');
      }
      throw fallo('no entendí "' + actual() + '". Revisa que la expresión esté bien escrita.');
    }

    if (grado(polinomio) > MAX_GRADO) {
      throw fallo('el grado máximo es ' + MAX_GRADO + ' (esta expresión es de grado ' + grado(polinomio) + ').');
    }
    return polinomio;
  }

  // Lee numerador y denominador y revisa que la función tenga sentido.
  function leerFuncion(textoNumerador, textoDenominador) {
    var N = leerPolinomio(textoNumerador, 'numerador');
    var D = leerPolinomio(textoDenominador, 'denominador');
    if (esCero(D)) {
      throw errorDe('denominador', 'no puede ser 0 (no se puede dividir entre 0).');
    }
    return { N: N, D: D };
  }

  // Para la pantalla: devuelve null si todo está bien, o { mensaje, campo }.
  function validar(textoNumerador, textoDenominador) {
    try {
      leerFuncion(textoNumerador, textoDenominador);
      return null;
    } catch (e) {
      return { mensaje: e.message, campo: e.campo || 'numerador' };
    }
  }


  /* ===================================================================
     PASO 3 · RAÍCES REALES DE UN POLINOMIO
     ===================================================================

     Una RAÍZ (o cero) de un polinomio es un valor de x que lo vuelve 0.
     Ejemplo: x² - 1 vale 0 en x = 1 y en x = -1.

     Según el grado se usa un método distinto:

     · GRADO 1  (ax + b = 0)             ->  x = -b / a
     · GRADO 2  (ax² + bx + c = 0)       ->  FÓRMULA GENERAL:
              discriminante = b² - 4ac
              si es negativo: no hay raíces reales
              si es 0: una raíz  x = -b / 2a
              si es positivo: dos raíces  x = (-b ± √discriminante) / 2a
     · GRADO 3 o más (no hay fórmula sencilla) -> se usa un método numérico:

            a) Se calculan los PUNTOS CRÍTICOS: las raíces de la derivada
               (donde la gráfica cambia de subir a bajar o al revés).
            b) Entre dos puntos críticos seguidos la gráfica solo sube o solo
               baja, así que cruza el eje X como máximo UNA vez.
            c) Si en los dos extremos de ese tramo el polinomio tiene signo
               contrario (uno positivo y otro negativo), el TEOREMA DE BOLZANO
               asegura que hay una raíz en medio.
            d) Esa raíz se encuentra por BISECCIÓN: se parte el tramo a la mitad,
               se ve en cuál mitad cambia el signo, y se repite 100 veces.
            e) Si un punto crítico vale 0, también es raíz (la gráfica solo
               "toca" el eje, como en x²).

        Para que los tramos de (b) cubran toda la recta se usan como extremos
        -R y +R, donde R es la COTA DE CAUCHY: todas las raíces están entre
        -R y R si  R = 1 + (mayor |coeficiente| / |coeficiente principal|).

     Las raíces de la derivada se calculan con este mismo método (recursivo):
     la derivada de un polinomio de grado 4 es de grado 3, la de grado 3 es de
     grado 2 (fórmula general), y así se llega a un caso que ya sabemos resolver.
     =================================================================== */

  function raicesCuadratica(a, b, c) {
    var discriminante = b * b - 4 * a * c;
    if (discriminante < -EPS) {
      return [];
    }
    if (Math.abs(discriminante) <= EPS) {
      return [-b / (2 * a)];
    }
    var raizDisc = Math.sqrt(discriminante);
    var x1 = (-b - raizDisc) / (2 * a);
    var x2 = (-b + raizDisc) / (2 * a);
    return x1 < x2 ? [x1, x2] : [x2, x1];
  }

  // Cota de Cauchy: todas las raíces reales están entre -R y R
  function cotaDeRaices(p) {
    var n = grado(p);
    var mayor = 0;
    for (var i = 0; i < n; i++) {
      mayor = Math.max(mayor, Math.abs(p[i] / p[n]));
    }
    return 1 + mayor;
  }

  // Bisección: p(a) y p(b) tienen signos distintos, así que hay una raíz entre a y b.
  function biseccion(p, a, b) {
    var fa = evaluar(p, a);
    for (var i = 0; i < 100; i++) {
      var medio = (a + b) / 2;
      var fm = evaluar(p, medio);
      if (fm === 0) {
        return medio;
      }
      if (fa * fm < 0) {
        b = medio;          // la raíz está en la mitad izquierda
      } else {
        a = medio;          // la raíz está en la mitad derecha
        fa = fm;
      }
    }
    return (a + b) / 2;
  }

  // Devuelve la lista de raíces reales DISTINTAS, de menor a mayor.
  // Ejemplo: x² - 1 -> [-1, 1]      (x-1)² -> [1]      x² + 1 -> []
  function raicesReales(polinomio) {
    var p = normalizar(polinomio);
    var n = grado(p);

    if (esCero(p) || n === 0) {
      return [];                                   // una constante no tiene raíces
    }
    if (n === 1) {
      return [limpiarNumero(-p[0] / p[1])];
    }
    if (n === 2) {
      return raicesCuadratica(p[2], p[1], p[0]).map(limpiarNumero);
    }

    // Grado 3 o más: puntos críticos + bisección (pasos a-e de arriba)
    var criticos = raicesReales(derivar(p));
    var R = cotaDeRaices(p);
    var limites = [-R].concat(criticos, [R]);
    var raices = [];

    // e) Un punto crítico donde el polinomio vale 0 es raíz (raíz doble, triple...)
    criticos.forEach(function (c) {
      if (Math.abs(evaluar(p, c)) < EPS) {
        raices.push(c);
      }
    });

    // b-d) En cada tramo, si hay cambio de signo, hay una raíz
    for (var i = 0; i < limites.length - 1; i++) {
      var a = limites[i];
      var b = limites[i + 1];
      var fa = evaluar(p, a);
      var fb = evaluar(p, b);
      if (Math.abs(fa) < EPS || Math.abs(fb) < EPS) {
        continue;                                  // la raíz está en un extremo y ya se agregó
      }
      if (fa * fb < 0) {
        raices.push(biseccion(p, a, b));
      }
    }

    // Se ordenan y se quitan repetidas
    raices.sort(function (u, v) { return u - v; });
    var distintas = [];
    raices.forEach(function (r) {
      if (distintas.length === 0 || Math.abs(r - distintas[distintas.length - 1]) > 1e-7) {
        distintas.push(limpiarNumero(r));
      }
    });
    return distintas;
  }

  // ¿El número x está (casi) en la lista?
  function estaCerca(x, lista) {
    return lista.some(function (y) { return Math.abs(x - y) < CERCA; });
  }

  function casiIgual(a, b) {
    return a === b || Math.abs(a - b) < 1e-7;
  }


  /* ===================================================================
     PASO 4 · LAS PROPIEDADES DE LA FUNCIÓN
     ===================================================================
     Cada función de esta sección calcula UNA propiedad. */

  // ---------------------------------------------------------------
  // 1. ORDENADA AL ORIGEN
  // Es el punto donde la gráfica corta el eje Y, o sea, f(0).
  // Teoría: f(0) = numerador(0) / denominador(0). En un polinomio, el valor
  // en x = 0 es simplemente su primer coeficiente (el número sin x).
  // Si denominador(0) = 0, x = 0 no está en el dominio y no hay ordenada.
  // Ejemplo: (2x³ - x + 4) / (3x + 6)  ->  4 / 6 = 0.667  ->  (0, 0.667)
  // ---------------------------------------------------------------
  function calcularOrdenada(N, D) {
    if (D[0] === 0) {
      return null;
    }
    return { x: 0, y: N[0] / D[0] };
  }

  // ---------------------------------------------------------------
  // 2. RAÍCES
  // Son los x donde la gráfica toca el eje X: f(x) = 0.
  // Teoría: una fracción vale 0 cuando su numerador vale 0, SIEMPRE QUE el
  // denominador no valga 0 también (si no, ese x ni siquiera está en el dominio).
  // Ejemplo: (x² - 1) / (x - 1)  -> el numerador vale 0 en x = 1 y x = -1,
  // pero en x = 1 el denominador también vale 0, así que solo queda x = -1.
  // ---------------------------------------------------------------
  function calcularRaices(N, cerosDelDenominador) {
    return raicesReales(N).filter(function (x) {
      return !estaCerca(x, cerosDelDenominador);
    });
  }

  // ---------------------------------------------------------------
  // 3. HUECOS (factores comunes)
  // Teoría: si numerador y denominador comparten un factor (x - a), ese
  // factor se puede cancelar y la función "se ve igual" en todos lados,
  // excepto en x = a, donde la función original no existe: queda un
  // agujero (hueco) en la gráfica.
  //
  //     (x² - 1) / (x - 1) = (x - 1)(x + 1) / (x - 1) = x + 1   (excepto en x = 1)
  //
  // La altura del hueco es el valor de la función SIMPLIFICADA en x = a:
  //     x + 1 en x = 1  ->  2  ->  hueco en (1, 2)
  //
  // Cómo lo hace el código:
  //   - G es el factor común (mcd). Sus raíces son los x candidatos a hueco.
  //   - Ns y Ds son numerador y denominador ya sin el factor común.
  //   - Si después de cancelar el denominador SIGUE valiendo 0 en ese x
  //     (pasa con 1/(x-1)² ), entonces no es hueco sino asíntota vertical.
  // ---------------------------------------------------------------
  function calcularHuecos(G, Ns, Ds) {
    if (grado(G) < 1) {
      return [];
    }
    var huecos = [];
    raicesReales(G).forEach(function (x) {
      var abajo = evaluar(Ds, x);
      if (Math.abs(abajo) > CERCA) {
        // (y no se redondea aquí: se redondea hasta que se escribe en pantalla)
        huecos.push({ x: x, y: evaluar(Ns, x) / abajo });
      }
    });
    return huecos;
  }

  // ---------------------------------------------------------------
  // 4. ASÍNTOTAS VERTICALES
  // Teoría: son rectas x = a donde la función se dispara hacia +∞ o -∞.
  // Pasa cuando el denominador vale 0 y el numerador NO. Por eso se usan las
  // raíces del denominador YA SIMPLIFICADO (sin el factor común, que da hueco).
  // Ejemplo: (2x³ - x + 4) / (3x + 6)  ->  3x + 6 = 0  ->  x = -2
  // ---------------------------------------------------------------
  function calcularAsintotasVerticales(Ds) {
    return raicesReales(Ds);
  }

  // ---------------------------------------------------------------
  // 5. ASÍNTOTA HORIZONTAL
  // Teoría: se mira a dónde se acerca f(x) cuando x se hace gigante
  // (x → ∞). Solo importa el término de mayor grado de cada polinomio:
  //
  //    grado numerador  <  grado denominador  ->  y = 0
  //    grado numerador  =  grado denominador  ->  y = (coef. principal N) / (coef. principal D)
  //    grado numerador  >  grado denominador  ->  no hay horizontal
  //
  // Ejemplos:  1 / x         -> y = 0
  //            (2x²+1)/(3x²) -> y = 2/3
  //            x² / x        -> no hay (pero sí puede haber oblicua)
  // Devuelve el valor de y, o null si no existe.
  // ---------------------------------------------------------------
  function calcularAsintotaHorizontal(N, D) {
    var gN = grado(N);
    var gD = grado(D);
    if (gN < gD) {
      return 0;
    }
    if (gN === gD) {
      return N[gN] / D[gD];
    }
    return null;
  }

  // ---------------------------------------------------------------
  // 6. ASÍNTOTA OBLICUA
  // Teoría: existe cuando el grado del numerador es EXACTAMENTE uno más que
  // el del denominador. Se hace la división larga N ÷ D:
  //
  //        N = D · cociente + residuo
  //        N / D = cociente + residuo / D
  //
  // Cuando x es gigante, residuo / D se acerca a 0, así que la función se
  // parece al cociente, que en este caso es una recta  y = m·x + b.
  //
  // Ejemplo: (x² + 1) / x   ->  x² + 1 = x · (x) + 1  ->  cociente x  ->  y = x
  //
  // Nota: si el residuo es 0 (como en (x²-1)/(x-1) = x + 1) la función es
  // la propia recta con un hueco. Aquí se reporta igual la recta; si el
  // profesor no lo considera asíntota, basta con agregar
  //     if (esCero(division.residuo)) { return null; }
  // Devuelve { pendiente, ordenada } o null si no existe.
  // ---------------------------------------------------------------
  function calcularAsintotaOblicua(N, D) {
    if (grado(N) !== grado(D) + 1) {
      return null;
    }
    var division = dividir(N, D);
    return { pendiente: division.cociente[1], ordenada: division.cociente[0] };
  }


  /* ===================================================================
     PASO 5 · EL RANGO
     ===================================================================

     El RANGO es el conjunto de valores de y que la función realmente toma.

     MÉTODO (el de Cálculo Diferencial): partir la recta en tramos y en cada
     tramo ver entre qué valores se mueve la función.

        1. Las asíntotas verticales cortan la recta en TRAMOS. En cada tramo
           la función es continua (sin saltos).
        2. En un tramo continuo, los valores de y van desde un MÍNIMO hasta un
           MÁXIMO, y toma todos los valores de en medio (Teorema del Valor
           Intermedio). Esos extremos solo pueden estar en dos lugares:
              a) en un PUNTO CRÍTICO, donde la derivada vale 0 (cima o valle),
                 y ahí el valor SÍ se alcanza  -> el extremo es CERRADO [ ]
              b) en los EXTREMOS DEL TRAMO, como un LÍMITE (a dónde se acerca
                 la función sin llegar)           -> el extremo es ABIERTO ( )
        3. Se juntan los intervalos de todos los tramos (unión).
        4. Los HUECOS quitan un valor de y, salvo que otro x distinto dé ese
           mismo valor.

     Derivada de una fracción (regla del cociente):
          f'(x) = (N'·D - N·D') / D²
     Se vuelve 0 cuando el numerador vale 0:  N'·D - N·D' = 0.
     Esas raíces son los puntos críticos.
     =================================================================== */

  // Signo (+1 o -1) que tiene el polinomio p JUSTO a la derecha (lado = 1)
  // o JUSTO a la izquierda (lado = -1) de una de sus raíces v.
  //
  // Teoría: si p(v) = 0, se deriva hasta que la derivada ya NO valga 0 en v.
  // Si fue necesario derivar k veces, cerca de v el polinomio se comporta como
  //      (derivada k)(v) · (x - v)^k / k!
  // así que el signo es el de esa derivada, y cambia a la izquierda
  // cuando k es impar (porque (negativo)^impar es negativo).
  // Ejemplo: p = x en v = 0: k = 1, derivada = 1  ->  derecha +, izquierda -.
  function signoCercaDeRaiz(p, v, lado) {
    var q = p;
    var k = 0;
    while (!esCero(q) && Math.abs(evaluar(q, v)) < 1e-6) {
      q = derivar(q);
      k++;
    }
    var signo = evaluar(q, v) >= 0 ? 1 : -1;
    return (lado === -1 && k % 2 === 1) ? -signo : signo;
  }

  // LÍMITE de Ns/Ds cuando x se va a +∞ (direccion = 1) o a -∞ (direccion = -1).
  // Se usan los mismos casos de la asíntota horizontal:
  //    grado N < grado D  -> 0
  //    grados iguales     -> cociente de coeficientes principales
  //    grado N > grado D  -> ±∞. El signo es el del cociente de coeficientes,
  //                          y al ir a -∞ se invierte si la diferencia de grados
  //                          es impar (porque (-gigante)^impar es negativo).
  function limiteEnInfinito(Ns, Ds, direccion) {
    var gN = grado(Ns);
    var gD = grado(Ds);
    if (gN < gD) {
      return 0;
    }
    var cociente = Ns[gN] / Ds[gD];
    if (gN === gD) {
      return cociente;
    }
    var signo = cociente > 0 ? 1 : -1;
    if (direccion === -1 && (gN - gD) % 2 === 1) {
      signo = -signo;
    }
    return signo * Infinity;
  }

  // LÍMITE de Ns/Ds cuando x se acerca a un punto "punto" por un lado
  // (lado = 1 por la derecha, lado = -1 por la izquierda).
  //   - Si punto es ±∞: es el límite de arriba.
  //   - Si punto es una asíntota vertical: da +∞ o -∞ según el signo de la
  //     fracción a ese lado (signo del numerador × signo del denominador).
  function limiteEn(Ns, Ds, punto, lado) {
    if (punto === Infinity) {
      return limiteEnInfinito(Ns, Ds, 1);
    }
    if (punto === -Infinity) {
      return limiteEnInfinito(Ns, Ds, -1);
    }
    var signoNumerador = evaluar(Ns, punto) >= 0 ? 1 : -1;
    return signoNumerador * signoCercaDeRaiz(Ds, punto, lado) * Infinity;
  }

  // Un intervalo se guarda así: { min, max, cerradoMin, cerradoMax }
  //   { min: 0, max: Infinity, cerradoMin: false, cerradoMax: false }  ->  (0, ∞)
  //   { min: -0.5, max: 0.5, cerradoMin: true, cerradoMax: true }      ->  [-0.5, 0.5]
  function copiarIntervalo(i) {
    return { min: i.min, max: i.max, cerradoMin: i.cerradoMin, cerradoMax: i.cerradoMax };
  }

  // Rango de la fracción Ns/Ds dentro de UN tramo (desde "inicio" hasta "fin").
  function rangoDelTramo(Ns, Ds, inicio, fin, criticos) {
    // Valores candidatos a ser el mínimo o el máximo del tramo
    var candidatos = [
      { valor: limiteEn(Ns, Ds, inicio, 1), alcanzado: false },   // límite al inicio (no se alcanza)
      { valor: limiteEn(Ns, Ds, fin, -1), alcanzado: false }      // límite al final (no se alcanza)
    ];
    criticos.forEach(function (c) {
      if (c > inicio && c < fin) {
        candidatos.push({ valor: evaluar(Ns, c) / evaluar(Ds, c), alcanzado: true });
      }
    });

    var valores = candidatos.map(function (c) { return c.valor; });
    var minimo = Math.min.apply(null, valores);
    var maximo = Math.max.apply(null, valores);

    // Un extremo es cerrado solo si algún punto crítico lo alcanza de verdad
    function seAlcanza(extremo) {
      return candidatos.some(function (c) { return c.alcanzado && casiIgual(c.valor, extremo); });
    }

    var intervalo = {
      min: minimo,
      max: maximo,
      cerradoMin: seAlcanza(minimo),
      cerradoMax: seAlcanza(maximo)
    };
    if (casiIgual(minimo, maximo)) {
      // Función constante en este tramo (por ejemplo f(x) = 3): solo toma un valor
      intervalo.cerradoMin = true;
      intervalo.cerradoMax = true;
    }
    return intervalo;
  }

  // Une intervalos que se traslapan o se tocan.
  // Ejemplo: (0, 2] y (1, 5)  ->  (0, 5)       (0, 1) y (1, 5)  ->  se quedan separados
  function unirIntervalos(lista) {
    var orden = lista.slice().sort(function (a, b) {
      return a.min < b.min ? -1 : (a.min > b.min ? 1 : 0);
    });
    var resultado = [copiarIntervalo(orden[0])];

    for (var i = 1; i < orden.length; i++) {
      var actual = orden[i];
      var ultimo = resultado[resultado.length - 1];

      if (casiIgual(actual.min, ultimo.min)) {
        ultimo.cerradoMin = ultimo.cerradoMin || actual.cerradoMin;
      }

      var seTraslapan = actual.min < ultimo.max && !casiIgual(actual.min, ultimo.max);
      var seTocanCerrados = casiIgual(actual.min, ultimo.max) && (actual.cerradoMin || ultimo.cerradoMax);

      if (!seTraslapan && !seTocanCerrados) {
        resultado.push(copiarIntervalo(actual));
      } else if (casiIgual(actual.max, ultimo.max)) {
        ultimo.cerradoMax = ultimo.cerradoMax || actual.cerradoMax;
      } else if (actual.max > ultimo.max) {
        ultimo.max = actual.max;
        ultimo.cerradoMax = actual.cerradoMax;
      }
    }
    return resultado;
  }

  // Quita un valor y de una lista de intervalos.
  // Ejemplo: quitar 2 de (-∞, ∞)  ->  (-∞, 2) ∪ (2, ∞)
  function quitarValor(intervalos, y) {
    var nuevos = [];
    intervalos.forEach(function (iv) {
      var dentroPorIzquierda = iv.min < y || (casiIgual(iv.min, y) && iv.cerradoMin);
      var dentroPorDerecha = y < iv.max || (casiIgual(iv.max, y) && iv.cerradoMax);
      if (!(dentroPorIzquierda && dentroPorDerecha)) {
        nuevos.push(iv);                                  // y no está en este intervalo
      } else if (casiIgual(iv.min, iv.max)) {
        return;                                           // era un solo punto y desaparece
      } else if (casiIgual(y, iv.min)) {
        nuevos.push({ min: iv.min, max: iv.max, cerradoMin: false, cerradoMax: iv.cerradoMax });
      } else if (casiIgual(y, iv.max)) {
        nuevos.push({ min: iv.min, max: iv.max, cerradoMin: iv.cerradoMin, cerradoMax: false });
      } else {                                            // y está en medio: se parte en dos
        nuevos.push({ min: iv.min, max: y, cerradoMin: iv.cerradoMin, cerradoMax: false });
        nuevos.push({ min: y, max: iv.max, cerradoMin: false, cerradoMax: iv.cerradoMax });
      }
    });
    return nuevos;
  }

  // ¿Algún x que NO sea un hueco da el valor y?
  // Se buscan las soluciones de  Ns(x) = y · Ds(x),  o sea, las raíces de Ns - y·Ds.
  function seAlcanzaEnOtroPunto(Ns, Ds, y, xDeHuecos) {
    var ecuacion = restar(Ns, multiplicarPorNumero(Ds, y));
    if (esCero(ecuacion)) {
      return true;                // la función es constante: toma ese valor en todos lados
    }
    return raicesReales(ecuacion).some(function (x) {
      return !estaCerca(x, xDeHuecos);
    });
  }

  // Calcula el rango completo. Devuelve { intervalos, excluidos }.
  //   Ns, Ds        fracción ya simplificada
  //   asintotas     x de las asíntotas verticales
  //   huecos        lista de { x, y }
  function calcularRango(Ns, Ds, asintotas, huecos) {
    // Caso especial: si después de simplificar solo quedan números, la función
    // es constante (por ejemplo (2x+2)/(x+1) = 2, con un hueco en x = -1)
    // y el rango es ese único valor.
    if (grado(Ns) === 0 && grado(Ds) === 0) {
      var c = Ns[0] / Ds[0];
      return { intervalos: [{ min: c, max: c, cerradoMin: true, cerradoMax: true }], excluidos: [] };
    }

    // 1. Tramos: la recta cortada por las asíntotas verticales
    var puntos = [-Infinity].concat(asintotas, [Infinity]);

    // 2. Puntos críticos: raíces de N'·D - N·D'  (se descartan las asíntotas)
    var derivadaNumerador = restar(
      multiplicar(derivar(Ns), Ds),
      multiplicar(Ns, derivar(Ds))
    );
    var criticos = raicesReales(derivadaNumerador).filter(function (c) {
      return !estaCerca(c, asintotas);
    });

    // 3. Rango de cada tramo
    var intervalos = [];
    for (var i = 0; i < puntos.length - 1; i++) {
      intervalos.push(rangoDelTramo(Ns, Ds, puntos[i], puntos[i + 1], criticos));
    }

    // 4. Unión de todos los tramos
    var union = unirIntervalos(intervalos);

    // 5. Valores que quitan los huecos
    var xDeHuecos = huecos.map(function (h) { return h.x; });
    var excluidos = [];
    huecos.forEach(function (h) {
      var yaEsta = excluidos.some(function (e) { return casiIgual(e, h.y); });
      if (!yaEsta && !seAlcanzaEnOtroPunto(Ns, Ds, h.y, xDeHuecos)) {
        excluidos.push(h.y);
      }
    });
    excluidos.forEach(function (y) {
      union = quitarValor(union, y);
    });

    return { intervalos: union, excluidos: excluidos };
  }


  /* ===================================================================
     PASO 6 · DE NÚMEROS A TEXTO
     =================================================================== */

  // 3 decimales máximo y sin ceros de sobra:  0.6666667 -> "0.667"   2 -> "2"
  function formatearNumero(n) {
    if (n === Infinity) {
      return '∞';
    }
    if (n === -Infinity) {
      return '-∞';
    }
    var redondeado = Number(n.toFixed(DECIMALES));
    return String(redondeado === 0 ? 0 : redondeado);
  }

  function formatearLista(lista, formato) {
    return lista.map(formato).join(', ');
  }

  // y = m·x + b escrito bonito:  1,0 -> "X"   2,-3 -> "2X - 3"   -1,4 -> "-X + 4"
  function formatearRecta(pendiente, ordenada) {
    var parteX;
    if (pendiente === 1) {
      parteX = 'X';
    } else if (pendiente === -1) {
      parteX = '-X';
    } else {
      parteX = formatearNumero(pendiente) + 'X';
    }
    if (formatearNumero(ordenada) === '0') {
      return parteX;
    }
    return parteX + (ordenada > 0 ? ' + ' : ' - ') + formatearNumero(Math.abs(ordenada));
  }

  function formatearIntervalo(iv) {
    if (casiIgual(iv.min, iv.max)) {
      return '{' + formatearNumero(iv.min) + '}';
    }
    return (iv.cerradoMin ? '[' : '(') + formatearNumero(iv.min) + ', ' +
           formatearNumero(iv.max) + (iv.cerradoMax ? ']' : ')');
  }

  // Si los intervalos juntos forman "todos los reales menos algunos puntos"
  // devuelve esos puntos (para escribir R \ {...}); si no, devuelve null.
  function puntosFaltantes(intervalos) {
    var primero = intervalos[0];
    var ultimo = intervalos[intervalos.length - 1];
    if (primero.min !== -Infinity || ultimo.max !== Infinity) {
      return null;
    }
    var puntos = [];
    for (var i = 0; i < intervalos.length - 1; i++) {
      var a = intervalos[i];
      var b = intervalos[i + 1];
      if (casiIgual(a.max, b.min) && !a.cerradoMax && !b.cerradoMin) {
        puntos.push(a.max);
      } else {
        return null;
      }
    }
    return puntos;
  }

  function formatearRango(rango) {
    var faltantes = puntosFaltantes(rango.intervalos);
    if (faltantes !== null) {
      return faltantes.length === 0 ? 'R' : 'R \\ {' + formatearLista(faltantes, formatearNumero) + '}';
    }
    return rango.intervalos.map(formatearIntervalo).join(' ∪ ');
  }

  var NO_EXISTE = 'No existe';


  /* ===================================================================
     PASO 7 · analizar(): JUNTA TODO
     =================================================================== */

  function analizar(textoNumerador, textoDenominador) {
    // 1. Texto -> polinomios (si hay un error de escritura, se regresa el mensaje)
    var funcion;
    try {
      funcion = leerFuncion(textoNumerador, textoDenominador);
    } catch (e) {
      return { ok: false, error: e.message, campo: e.campo };
    }
    var N = funcion.N;
    var D = funcion.D;

    // 2. Dominio: todos los reales menos los x que vuelven 0 al denominador
    var excluidosDelDominio = raicesReales(D);

    // 3. Factor común y fracción simplificada (Ns / Ds)
    var G = mcd(N, D);
    var hayFactorComun = grado(G) >= 1;
    var Ns = hayFactorComun ? dividir(N, G).cociente : N;
    var Ds = hayFactorComun ? dividir(D, G).cociente : D;

    // 4. Cada propiedad
    var ordenada = calcularOrdenada(N, D);
    var raices = esCero(N) ? [] : calcularRaices(N, excluidosDelDominio);
    var asintotasVerticales = calcularAsintotasVerticales(Ds);
    var asintotaHorizontal = calcularAsintotaHorizontal(N, D);
    var asintotaOblicua = calcularAsintotaOblicua(N, D);
    var huecos = calcularHuecos(G, Ns, Ds);
    var rango = calcularRango(Ns, Ds, asintotasVerticales, huecos);

    // 5. Textos para la pantalla
    var texto = {
      ordenada: ordenada ? '(0, ' + formatearNumero(ordenada.y) + ')' : NO_EXISTE,
      raiz: esCero(N) ? 'Todos los X del dominio' :
            (raices.length ? formatearLista(raices, function (x) { return 'X = ' + formatearNumero(x); }) : NO_EXISTE),
      asintotaVertical: asintotasVerticales.length ?
            formatearLista(asintotasVerticales, function (x) { return 'X = ' + formatearNumero(x); }) : NO_EXISTE,
      asintotaHorizontal: asintotaHorizontal !== null ? 'Y = ' + formatearNumero(asintotaHorizontal) : NO_EXISTE,
      hueco: huecos.length ?
            formatearLista(huecos, function (h) { return '(' + formatearNumero(h.x) + ', ' + formatearNumero(h.y) + ')'; }) : NO_EXISTE,
      dominio: excluidosDelDominio.length ?
            'R \\ {' + formatearLista(excluidosDelDominio, formatearNumero) + '}' : 'R',
      rango: formatearRango(rango),
      asintotaOblicua: asintotaOblicua ?
            'Y = ' + formatearRecta(asintotaOblicua.pendiente, asintotaOblicua.ordenada) : NO_EXISTE
    };

    // 6. Los mismos resultados como números
    return {
      ok: true,
      texto: texto,
      datos: {
        numerador: N,
        denominador: D,
        factorComun: G,
        ordenada: ordenada,
        raices: raices,
        asintotasVerticales: asintotasVerticales,
        asintotaHorizontal: asintotaHorizontal,
        asintotaOblicua: asintotaOblicua,
        huecos: huecos,
        excluidosDelDominio: excluidosDelDominio,
        rango: rango
      }
    };
  }


  // ---------------------------------------------------------------
  // Lo que se "publica" para que lo use el resto de la página
  // ---------------------------------------------------------------
  var MotorRacional = {
    analizar: analizar,
    validar: validar,
    MAX_GRADO: MAX_GRADO,
    // Funciones internas, expuestas solo para poder probarlas por separado
    _interno: {
      leerPolinomio: leerPolinomio,
      raicesReales: raicesReales,
      dividir: dividir,
      mcd: mcd,
      evaluar: evaluar
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MotorRacional;     // para probar con Node
  } else {
    global.MotorRacional = MotorRacional;   // en el navegador: window.MotorRacional
  }

})(typeof window !== 'undefined' ? window : globalThis);