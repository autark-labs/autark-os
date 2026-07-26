package com.autarkos.pro.product;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/pro")
public class ProProductStateController {

    private final ProProductStateService service;

    public ProProductStateController(ProProductStateService service) {
        this.service = service;
    }

    @GetMapping("/product-state")
    public ProProductState current() {
        return service.current();
    }
}
