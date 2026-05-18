@eci @regression @accesibility
Feature: Accesibilidad Supermercado ECI

  @accesibility
  Scenario: La página principal de supermercado es accesible
    Given Estoy en la pagina de supermercado
    When La página ha cargado por completo
    Then Compruebo que la página es accesible

  @accesibility
  Scenario: La página bebidas del supermercado es accesible
    Given Estoy en la pagina de bebidas del supermercado
    When La página ha cargado por completo
    Then Compruebo que la página es accesible

  @accesibility
  Scenario: La página de alimentación general del supermercado es accesible
    Given Estoy en la pagina de alimentación general del supermercado
    When La página ha cargado por completo
    Then Compruebo que la página es accesible

  @accesibility
  Scenario: La sección de Club del Gourmet es accesible 
    Given Estoy en la pagina de Club del Gourmet
    And La página ha cargado por completo
    And Compruebo que la página es accesible

  @accesibility
  Scenario: La página de detalle de un producto es accesible
    Given Estoy en la página de detalle de un producto
    When La página ha cargado por completo
    Then Compruebo que la página es accesible

  @accesibility
  Scenario: La página de buscar producto es accesible
    Given Estoy en la pagina de supermercado
    When Hago click en el campo de búsqueda
    And Introduzco el texto "arroz redondo sos 2 kg" en el campo de búsqueda
    And Deberia ver el producto "Arroz Redondo Sos 2 kg" en el resultado de la búsqueda
    And Deberia estar en la página de búsqueda de productos
    When La página ha cargado por completo
    Then Compruebo que la página es accesible

  @accesibility
  Scenario: El modal de entrega e identificación en Club del Gourmet es accesible
    Given Estoy en la pagina de supermercado
    When Hago click en la sección Club del Gourmet
    Then Estoy en la sección de Club del Gourmet
    When Hago click en el botón de añadir al carrito
    And La página ha cargado por completo
    Then Compruebo que el modal de identificación es accesible
    And Hago click en Continuar sin identificarme
    When La página ha cargado por completo
    Then Compruebo que el modal de entrega es accesible