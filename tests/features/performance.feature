Feature: Performance validation

  @performance @eci
  Scenario: ECI home page performance audit
    Given I am in ECI home page    
    When I audit performance
    Then performance audit should pass