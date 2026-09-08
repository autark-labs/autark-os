package com.autarkos.extensions;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.ObjectProvider;

@RestController
@RequestMapping("/api/v1/extensions/{extensionId}")
public final class ExtensionHostController {

    private final ExtensionHostService service;
    private final ObjectProvider<ExtensionRefreshScheduler>
            refreshScheduler;

    public ExtensionHostController(
            ExtensionHostService service,
            ObjectProvider<ExtensionRefreshScheduler>
                    refreshScheduler) {
        this.service = service;
        this.refreshScheduler = refreshScheduler;
    }

    @GetMapping("/ui-manifest")
    public ResponseEntity<ExtensionUiManifest> manifest(
            @PathVariable String extensionId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.manifest(extensionId));
    }

    @GetMapping(
            value = "/assets/{assetName}",
            produces = "text/javascript;charset=UTF-8")
    public ResponseEntity<byte[]> asset(
            @PathVariable String extensionId,
            @PathVariable String assetName) {
        ExtensionHostService.VerifiedAsset asset =
                service.asset(extensionId, assetName);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS)
                        .cachePrivate()
                        .immutable())
                .eTag('"' + asset.digest() + '"')
                .contentType(new MediaType(
                        "text", "javascript", StandardCharsets.UTF_8))
                .body(asset.contents());
    }

    @GetMapping("/surfaces/{surface}")
    public ResponseEntity<ExtensionSurfaceResult> surface(
            @PathVariable String extensionId,
            @PathVariable String surface) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.render(extensionId, surface));
    }

    @PostMapping(value = "/actions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ExtensionActionResult> action(
            @PathVariable String extensionId,
            jakarta.servlet.http.HttpServletRequest httpRequest) throws java.io.IOException {
        // This fixed header requires a same-origin browser request (cross-origin
        // requests need a CORS preflight, which this host does not grant).
        if (!"1".equals(httpRequest.getHeader("X-Autark-Extension-Action"))
                || "cross-site".equals(httpRequest.getHeader("Sec-Fetch-Site"))) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "Open this action from Autark-OS.");
        }
        byte[] body = httpRequest.getInputStream().readNBytes(ExtensionActionRequest.MAX_BYTES + 1);
        ExtensionActionRequest request;
        try { request = ExtensionActionRequest.decode(body); }
        finally { java.util.Arrays.fill(body, (byte) 0); }
        ExtensionActionResult result = service.action(extensionId, request);
        ExtensionRefreshScheduler scheduler = refreshScheduler.getIfAvailable();
        if (scheduler != null && result.summary() != null) {
            scheduler.acceptSummary(result.summary());
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(
            @PathVariable String extensionId) {
        service.requireRefreshAvailable(extensionId);
        ExtensionRefreshScheduler scheduler =
                refreshScheduler.getIfAvailable();
        if (scheduler == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus
                            .SERVICE_UNAVAILABLE,
                    "Private extension refresh is unavailable.");
        }
        scheduler.requestRefresh("explicit_refresh");
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .build();
    }

    @PostMapping("/navigation-rejections")
    public ResponseEntity<Void> navigationRejection(
            @PathVariable String extensionId) {
        service.recordNavigationRejection(extensionId);
        return ResponseEntity.noContent().build();
    }
}
