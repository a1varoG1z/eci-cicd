Feature: Performance validation

  @performance @izertis
  Scenario: Izertis home page performance audit
    Given I am in Izertis home page
    When I audit performance
    Then performance audit should pass