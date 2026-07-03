package com.autarkos.marketplace.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppInstanceViewProvider;

@RestController
@RequestMapping("/api/app-instances")
public class AppInstancesController {

    private final AppInstanceViewProvider appInstanceViewProvider;

    public AppInstancesController(AppInstanceViewProvider appInstanceViewProvider) {
        this.appInstanceViewProvider = appInstanceViewProvider;
    }

    @GetMapping
    public List<AppInstanceView> appInstances() {
        return appInstanceViewProvider.list();
    }
}
