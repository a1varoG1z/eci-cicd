  @prueba-eci
  Feature: ECI

    Background:
         Given Estoy en la pagina de inicio de El Corte Inglés
  
  
    @positive @eci-1
    Scenario: Añadir un producto al carrito del supermercado de forma exitosa de Club del Gourmet
        When Navego a la sección de supermercado club del gourmet
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

    Scenario: Añadir un producto al carrito de la sección todo en joyería y relojes
        When Navego a la sección de todo en joyería y relojes
        Then Estoy en la sección de todo en joyería y relojes
        When Hago click en el botón de añadir al carrito en todo en joyería y relojes
        Then Deberia ver que la cesta de joyería y relojes es 1