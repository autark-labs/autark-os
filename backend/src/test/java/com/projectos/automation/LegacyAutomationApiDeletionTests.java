package com.projectos.automation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class LegacyAutomationApiDeletionTests {

    @Test
    void publicAutomationPreviewApiIsDeletedUntilAutomationIsProductized() {
        assertMissing("com.projectos.automation.AutomationController");
        assertMissing("com.projectos.automation.AutomationRecipe");
        assertMissing("com.projectos.automation.api.AutomationRecipeUpdateRequest");
    }

    @Test
    void automationServiceOnlyExposesGuardianPolicy() {
        assertThat(Arrays.stream(AutomationService.class.getDeclaredMethods()).map(method -> method.getName()))
                .contains("recipeEnabled")
                .doesNotContain("recipes", "update");
    }

    private void assertMissing(String className) {
        assertThatThrownBy(() -> Class.forName(className))
                .isInstanceOf(ClassNotFoundException.class);
    }
}
