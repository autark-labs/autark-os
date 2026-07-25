package com.autarkos.system;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.autarkos.jobs.AutarkOsJob;

@RestController
@RequestMapping("/api/system/core-update")
public class CoreUpdateController {

    private final CoreUpdateService service;

    public CoreUpdateController(CoreUpdateService service) {
        this.service = service;
    }

    @GetMapping
    public CoreUpdateModels.Status status() {
        return service.status();
    }

    @PostMapping(path = "/bundle", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CoreUpdateModels.Status stage(
            @RequestPart("bundle") MultipartFile bundle) {
        return service.stage(bundle);
    }

    @PostMapping("/apply")
    public AutarkOsJob apply(
            @RequestBody CoreUpdateModels.ApplyRequest request) {
        return service.apply(request);
    }
}
