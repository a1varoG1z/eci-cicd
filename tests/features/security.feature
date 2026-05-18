Feature: Security validation

  @security
  Scenario: ECI home page security scan
    Given I am in ECI home page
    When I scan security
    Then security scan should pass
