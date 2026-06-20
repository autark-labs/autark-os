package com.projectos.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.system.ProjectSettingsRepository;

class AdminSecurityServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void startsUnclaimedAndAcceptsOwnerClaim() {
        AdminSecurityService service = service(false);

        AdminSecurityStatus initial = service.status();
        assertThat(initial.devMode()).isFalse();
        assertThat(initial.claimed()).isFalse();
        assertThat(initial.authRequired()).isTrue();
        assertThat(initial.setupCode()).isNotBlank();

        AdminSecuritySession session = service.claim(new AdminClaimRequest(initial.setupCode(), "correct horse battery staple"));

        assertThat(session.token()).isNotBlank();
        assertThat(service.status().claimed()).isTrue();
        assertThat(service.authenticate(session.token())).isTrue();
        assertThat(service.authenticate("wrong")).isFalse();
    }

    @Test
    void rejectsWrongPasswordAndSupportsLogin() {
        AdminSecurityService service = service(false);
        String setupCode = service.status().setupCode();
        service.claim(new AdminClaimRequest(setupCode, "correct horse battery staple"));

        assertThat(service.login(new AdminLoginRequest("bad password")).authorized()).isFalse();
        AdminSecuritySession session = service.login(new AdminLoginRequest("correct horse battery staple"));

        assertThat(session.authorized()).isTrue();
        assertThat(service.authenticate(session.token())).isTrue();
    }

    @Test
    void devModeDoesNotRequireAuth() {
        AdminSecurityService service = service(true);

        assertThat(service.status().devMode()).isTrue();
        assertThat(service.status().authRequired()).isFalse();
        assertThat(service.authenticate("")).isTrue();
    }

    private AdminSecurityService service(boolean devMode) {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new AdminSecurityService(new ProjectSettingsRepository(new RuntimeLayout(properties)), devMode);
    }
}
