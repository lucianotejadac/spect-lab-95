# SPECT Lab 95

Simulador educativo de reconstrucción tomográfica SPECT con una interfaz inspirada en Windows 95.

El flujo permite cargar adquisiciones SPECT y CT desde el equipo del estudiante, revisar una reconstrucción FBP para registro, comparar reconstrucciones OSEM con distintas correcciones y exportar resultados para su revisión en un visor DICOM.

## Tutorial de paratiroides

El botón **Tutorial paratiroides** de la barra de menú abre un panel guiado sobre cinco casos reales de SPECT/CT con sestamibi en dos fases. El panel pregunta qué caso te asignaron, indica qué archivo cargar en cada paso, comprueba contra el archivo cargado que sea el correcto (fase y caso, por el marco de referencia) y resalta el control que toca usar. La receta es la misma para todos: OSEM 2×8 con corrección de atenuación y gaussiano final de 8,4 mm, exportada con el nombre «Caso N fase».

Al terminar las dos fases, el panel entrega un enlace al visor Volumina con el caso ya elegido: allí sigue la segunda parte, fusión con el CT de cada fase, cortes axiales fusionados y captura del MIP. `?caso=N` en la URL abre el simulador directamente en ese caso.

Los datos de los casos viven en `paratiroides-casos.js`, idéntico en los dos repositorios. La clínica está desidentificada y los marcos de referencia se guardan como hash, no como UID. Los DICOM de los casos no forman parte del repositorio.

## Privacidad

La aplicación funciona íntegramente en el navegador. Los archivos DICOM seleccionados no se cargan en este repositorio ni se envían a un servidor por esta página estática.

## Alcance

Este proyecto es un simulador docente. No está validado como dispositivo médico y sus resultados no deben emplearse para diagnóstico, tratamiento ni decisiones clínicas.

