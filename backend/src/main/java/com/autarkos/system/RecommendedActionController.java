package com.autarkos.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recommended-action")
public class RecommendedActionController {

    private final RecommendedActionProvider recommendedActionProvider;

    public RecommendedActionController(RecommendedActionProvider recommendedActionProvider) {
        this.recommendedActionProvider = recommendedActionProvider;
    }

    @GetMapping
    public RecommendedAction current() {
        return recommendedActionProvider.current();
    }

    @PostMapping("/{id}/dismiss")
    public void dismiss(@PathVariable String id) {
        recommendedActionProvider.dismiss(id);
    }
}
