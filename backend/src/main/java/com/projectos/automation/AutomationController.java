package com.projectos.automation;

import com.projectos.automation.api.AutomationRecipeUpdateRequest;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/automation")
public class AutomationController {

    private final AutomationService automationService;

    public AutomationController(AutomationService automationService) {
        this.automationService = automationService;
    }

    @GetMapping("/recipes")
    public List<AutomationRecipe> recipes() {
        return automationService.recipes();
    }

    @PutMapping("/recipes/{recipeId}")
    public AutomationRecipe update(@PathVariable String recipeId, @RequestBody AutomationRecipeUpdateRequest request) {
        return automationService.update(recipeId, request);
    }
}
