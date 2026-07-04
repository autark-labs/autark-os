package com.autarkos.pro;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.pro.models.ProModels;

@RestController
@RequestMapping("/api/pro")
public class ProController {

    private final ProService proService;

    public ProController(ProService proService) {
        this.proService = proService;
    }

    @GetMapping("/status")
    public ProModels.ProStatus status() {
        return proService.status();
    }

    @PostMapping("/register")
    public ProModels.ProStatus register() {
        return proService.registerInstall();
    }

    @PostMapping("/redeem-license")
    public ProModels.ProStatus redeemLicense(@RequestBody RedeemLicenseRequest request) {
        return proService.redeemLicense(request == null ? null : request.licenseCode());
    }

    @GetMapping("/privacy/payload-preview")
    public ProModels.ProPrivacyPayloadPreview privacyPayloadPreview() {
        return proService.privacyPayloadPreview();
    }

    public record RedeemLicenseRequest(String licenseCode) {
    }
}
