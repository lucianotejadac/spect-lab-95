# Bitácora de decisiones

Registro de lo que se pidió, lo que se decidió y por qué, sesión por sesión, para las dos
herramientas del curso: SPECT Lab 95 (este repositorio) y Volumina, el visor
(`lucianotejadac/visor_dicom`). Cada entrada sigue el esquema de un registro de decisiones
(ADR): contexto, decisión, alternativas descartadas, consecuencias, commits. Los detalles
de implementación están en los mensajes de commit; aquí va el razonamiento.

Sin datos de pacientes: los casos del tutorial están desidentificados y esta bitácora
tampoco los nombra.

---

## 2026-09-21 y 22 · Del diagnóstico de una fusión al tutorial de paratiroides

Participantes: Luciano Tejada (docente) y Claude (Claude Code).

### 1. Por qué MicroDicom no fusionaba el SPECT exportado con su CT

**Contexto.** Una OSEM exportada por el simulador no se podía fusionar en MicroDicom con
la CT del mismo estudio, aunque compartían `StudyInstanceUID` y `FrameOfReferenceUID`.

**Decisión.** Diagnóstico por variantes: nueve copias del mismo volumen, cada una con un
solo tag cambiado. Solo fusionaron las que traían `PatientAge` idéntico al de la CT.
Ausente, vacío o distinto fallaban por igual. El exportador no copiaba ese tag porque no
estaba en la lista de `simulador95-engine.js`; se agregó (`PatientAge`, VR `AS`).

**Descartado.** `ImagePositionPatient` en la raíz del multiframe, que el volumen sobresalga
del rango z de la CT, `IssuerOfPatientID`, `TypeOfPatientID`, `ModalitiesInStudy`,
`ImageType` DERIVED/ORIGINAL: ninguno cambiaba el resultado.

**Consecuencia.** MicroDicom concilia series por sus atributos de nivel estudio, incluido
`PatientAge`, que pertenece al módulo Patient Study y es fácil de olvidar al escribir DICOM
derivado. Cualquier serie sintética que deba fusionarse tiene que copiar todos esos
atributos, no solo los UID. Commit `05260bc`.

### 2. Simplificar la interfaz al flujo de clase

**Contexto.** El simulador exponía todas las opciones de reconstrucción y varios caminos
de carga; para la clase hacía falta un flujo único.

**Decisiones.** Paneles de comparación enlazados (`09eea52`); columna lateral solo en el
paso 3 (`350ad9c`, `3b03d4b`); botón para apagar ayudas y globos (`e6b6c41`, `93808a1`);
paleta del SPECT seleccionable con hot iron por omisión (`f0ec9da`); y la simplificación
(`703c501`): SPECT como un solo archivo, desfase del ejercicio de registro solo en X e Y
con botones + y −, aire fuera del campo asumido siempre, opciones ocultas pero vivas en
el código (dispersión, PSF, inicio desde FBP), exportación de la FBP con negativos
recortados a cero y declarados, y un nombre que encabeza el archivo y la descripción de
la serie.

**Descartado.** Borrar las opciones del código: se ocultan y se apagan, para poder volver a
mostrarlas.

**Consecuencia.** Hizo falta `[hidden]{display:none!important}`: la regla `label{display:block}`
de la hoja ganaba por origen al `[hidden]` del navegador y las etiquetas ocultas se seguían
viendo. Lo oculto nace apagado para que lo que se calcula sea lo que se ve.

### 3. Tutorial de paratiroides en dos partes, con un manifiesto compartido

**Contexto.** Cinco casos reales de SPECT/CT de paratiroides con sestamibi, en dos fases.
Se pidió un tutorial que guiara el procesamiento de cada caso hasta los productos de
referencia (OSEM con AC de cada fase, cortes axiales fusionados, captura del MIP),
atendiendo a las particularidades de cada uno, con la segunda parte en el visor.

**Decisiones.**
- Un solo manifiesto, `paratiroides-casos.js`, idéntico en los dos repositorios: clínica
  desidentificada, particularidades, datos esperados de cada fase y guía de qué mirar.
- El marco de referencia de cada fase se guarda como **hash FNV-1a de 32 bits** del
  `FrameOfReferenceUID`, no como el UID: basta para reconocer el archivo y no publica
  identificadores del PACS.
- El DICOM exportado lleva el caso y la fase en la descripción de la serie («Caso N
  fase»); el visor lo lee para comprobar que el alumno cargó el archivo correcto. La
  entrega entre herramientas viaja en el propio archivo.
- Receta única, OSEM 2×8 con AC y gaussiano de 8,4 mm, en las dos fases y los cinco
  casos: las diferencias que el alumno vea son del paciente, no del procesamiento.
- Productos de ambas fases, incluido el PNG del MIP fusionado.
- Antecedentes, procedimiento y hallazgos visibles; la impresión diagnóstica se revela al
  completar el caso en el visor.
- El visor **tolera hasta 1° de inclinación en NM** y lo avisa (`tiltDegrees`): la
  reconstrucción del equipo del caso 5 trae 0,6° de inclinación de gantry y `core.js` la
  rechazaba por oblicua. A 2,7 mm de vóxel el desplazamiento en los bordes queda por
  debajo de un vóxel. El CT sigue exigiendo orientación exacta.

**Descartado.** Publicar los UID; una receta distinta por fase (en la referencia el
precoz era 2×4); explicar el caso 5 como límite del visor en vez de tolerar la inclinación,
porque dejaba a ese caso sin segunda parte.

**Consecuencias.** Ganchos mínimos en el motor: `Lab95Live.get()` expone el CT preparado,
`Lab95Osem.entradas()` el historial, el evento `lab95state` avisa de cada cambio; en el
visor, el evento `volumina`. Una fase completada queda pegajosa, porque cargar la otra
fase descarta la anterior de la memoria. Commits `d77600f` (simulador) y `ee52d3b`
(visor).

### 4. Lo que enseñó probar como cinco estudiantes

**Contexto.** Se pidió recorrer cada caso como el estudiante que lo tendrá al día
siguiente, cometiendo los errores reales, y optimizar el tutorial con eso.

**Hallazgos y cambios.**
- Los botones de registro a 1 mm por clic eran un castigo (35 a 70 mm por eje): ahora
  repiten al mantener pulsado, primero despacio y después rápido.
- Al confirmar el registro se informa el residuo, porque la alineación real es cero y se
  puede medir sin arruinar el ejercicio.
- Los tropiezos se señalan donde ocurren, aunque no sea el paso actual: exportar la 1×1,
  exportar sin nombre, CT de la otra fase, serie sin elegir, SPECT antes que el CT, CT
  incompleto, cortes en el plano equivocado, PNG del VRT.
- «Revisar la fusión» no se cumple solo porque el visor la dibujó: exige recorrer los
  cortes. La guía de qué mirar pasó a un recuadro fijo de la fase.
- El motor no avisaba al terminar de leer los archivos del CT y el panel no se enteraba
  de la lista pendiente.
- Cada fase nombra su carpeta exacta; los casos con CT de atenuación explican cómo
  registrar un CT borroso (contorno externo, guiarse por la piel).
- En el MIP fusionado el corazón y el hígado se llevan la escala: el paso del PNG lo dice.

**Método.** Chrome sin interfaz manejado por el protocolo de depuración desde Node, con
los DICOM reales; `--dump-dom` con presupuesto de tiempo virtual no sirve cuando hay
workers. 387 comprobaciones, 0 fallas, en los cinco casos y las dos partes. Commits
`7684651` y `1c6d820`.

### 5. Preguntas para la discusión

Cinco por caso y cinco sobre el procesamiento, en el manifiesto. El visor las pliega
hasta completar el caso; el simulador abre las de procesamiento al cerrar la primera
parte. Commits `4f2c425` y `a17c8f7`.

### Fuera del repositorio

Se redactaron las instrucciones para los estudiantes y una rúbrica de la presentación
(tres criterios, pauta de cotejo por palabras y hechos clave, y hechos indispensables por
caso). La rúbrica por caso no se publica aquí porque adelanta la impresión diagnóstica.

### Pendientes y advertencias

- Los `.docx` de las carpetas de casos 2 a 5 traen nombre y RUT: sacarlos antes de
  repartir las carpetas.
- El caché del navegador tapa las publicaciones nuevas; Ctrl+F5 o versionar las URL de
  los scripts.
- Las pruebas usan accesos directos `_datos/` y `_productos/` dentro de cada repo,
  ignorados por git, que apuntan a la carpeta local de casos.
