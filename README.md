# SPECT Lab 95

Simulador educativo de reconstrucción tomográfica SPECT con una interfaz inspirada en Windows 95.

El flujo permite cargar adquisiciones SPECT y CT desde el equipo del estudiante, revisar una reconstrucción FBP para registro, comparar reconstrucciones OSEM con distintas correcciones y exportar resultados para su revisión en un visor DICOM.

## Tutorial de paratiroides

El botón **Tutorial paratiroides** de la barra de menú abre un panel guiado sobre cinco casos reales de SPECT/CT con sestamibi en dos fases. El panel pregunta qué caso te asignaron, indica qué archivo cargar en cada paso, comprueba contra el archivo cargado que sea el correcto (fase y caso, por el marco de referencia) y resalta el control que toca usar. La receta es la misma para todos: OSEM 2×8 con corrección de atenuación y gaussiano final de 8,4 mm, exportada con el nombre «Caso N fase».

Al terminar las dos fases, el panel entrega un enlace al visor Volumina con el caso ya elegido: allí sigue la segunda parte, fusión con el CT de cada fase, cortes axiales fusionados y captura del MIP. `?caso=N` en la URL abre el simulador directamente en ese caso.

Enlaces directos por caso, para repartir a los estudiantes: [caso 1](https://lucianotejadac.github.io/spect-lab-95/?caso=1) · [caso 2](https://lucianotejadac.github.io/spect-lab-95/?caso=2) · [caso 3](https://lucianotejadac.github.io/spect-lab-95/?caso=3) · [caso 4](https://lucianotejadac.github.io/spect-lab-95/?caso=4) · [caso 5](https://lucianotejadac.github.io/spect-lab-95/?caso=5). Cada estudiante necesita además la carpeta de su caso con las proyecciones NM y los CT de las dos fases.

Los datos de los casos viven en `paratiroides-casos.js`, idéntico en los dos repositorios. La clínica está desidentificada y los marcos de referencia se guardan como hash, no como UID. Los DICOM de los casos no forman parte del repositorio.

## Tutorial cardíaco

El botón **Tutorial cardíaco** guía la primera parte de un SPECT/CT de perfusión miocárdica con sestamibi, por fase (estrés y reposo): control de calidad de las proyecciones (cine, sinograma, linograma, comparación con la copia «QC Corrected» del equipo), FBP con órbita de 180°, registro con el CT de la fase, OSEM 2×8 sin y con corrección de atenuación, y reconstrucción de los 8 intervalos del gatillado en los cortes del corazón, exportados como «Caso N fase NoAC», «Caso N fase AC» y «Caso N fase gatillado». La segunda parte sigue en el [simulador cardíaco](https://lucianotejadac.github.io/simulador-cardiaco/).

`?cardiaco=N` abre el simulador directamente en ese caso: [1](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=1) · [2](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=2) · [3](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=3) · [4](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=4) · [5](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=5) · [6](https://lucianotejadac.github.io/spect-lab-95/?cardiaco=6). Los casos viven en `cardiaco-casos.js`, idéntico en los dos repositorios.

Para el tutorial cardíaco el motor acepta órbitas parciales (180° con dos cabezales a 90°) en la FBP, CT axiales con hasta 1° de inclinación, y adquisiciones gatilladas (`TimeSlotVector`) por intervalo.

## Privacidad

La aplicación funciona íntegramente en el navegador. Los archivos DICOM seleccionados no se cargan en este repositorio ni se envían a un servidor por esta página estática.

## Alcance

Este proyecto es un simulador docente. No está validado como dispositivo médico y sus resultados no deben emplearse para diagnóstico, tratamiento ni decisiones clínicas.

