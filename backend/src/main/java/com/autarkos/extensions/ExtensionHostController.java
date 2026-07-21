package com.autarkos.extensions;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1/extensions/{extensionId}")
public final class ExtensionHostController {

    private final ExtensionHostService service;

    public ExtensionHostController(ExtensionHostService service) {
        this.service = service;
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
    public ResponseEntity<JsonNode> surface(
            @PathVariable String extensionId,
            @PathVariable String surface) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.render(extensionId, surface));
    }
}
