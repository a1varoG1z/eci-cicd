@regression
Feature: Supermercado ECI

  Background:
     Given Estoy en la pagina de supermercado

  @positive
  Scenario: Buscar productos en el supermercado
    When Hago click en el campo de búsqueda
    And Introduzco el texto "arroz redondo sos 2 kg" en el campo de búsqueda
    Then Deberia ver el producto "Arroz Redondo Sos 2 kg" en el resultado de la búsqueda
    And Deberia estar en la página de búsqueda de productos

  @positive
  Scenario: Acceder a detalle de un producto
    When Hago click en el campo de búsqueda
    And Introduzco el texto "arroz redondo sos 2 kg" en el campo de búsqueda
    Then Deberia ver el producto "Arroz Redondo Sos 2 kg" en el resultado de la búsqueda
    And Deberia estar en la página de búsqueda de productos
    When Hago click en el producto "Arroz Redondo Sos 2 kg"
    Then Estoy en la página de detalle del producto "Arroz Redondo Sos 2 kg"

  @positive
  Scenario: Acceder a la sección de Club del Gourmet
    When Hago click en la sección Club del Gourmet
    Then Estoy en la sección de Club del Gourmet


  @positive @id-1
  Scenario: Añadir un producto al carrito del supermercado de forma exitosa de Club del Gourmet
    When Hago click en la sección Club del Gourmet
    Then Estoy en la sección de Club del Gourmet
    When Hago click en el botón de añadir al carrito
    And Hago click en Continuar sin identificarme
    Then Deberia ver el menu de eleccion de entrega
    When Hago click en Recogida
    Then Deberia ver el menu de recogida en tienda
    And Hago click en el desplegable de provincias
    And Selecciono "ALAVA-ARABA" en el desplegable de provincias
    Then Deberia ver la opcion "El Corte Inglés La Paz" entre las tiendas a seleccionar
    When Hago click en "El Corte Inglés La Paz" en tiendas
    And Hago click en el boton Aceptar
    Then Deberia ver que la cantidad del carrito es mayor que 0