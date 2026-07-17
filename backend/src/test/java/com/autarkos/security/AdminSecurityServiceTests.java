package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.testsupport.JpaTestRepositories;

class AdminSecurityServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void startsUnclaimedWithoutDisclosingClaimProofAndAcceptsLocalOwnerClaim() throws Exception {
        TestService fixture = service(false);

        AdminSecurityStatus initial = fixture.service().status();
        assertThat(initial.devMode()).isFalse();
        assertThat(initial.claimed()).isFalse();
        assertThat(initial.authRequired()).isTrue();
        assertThat(initial.setupCodeCommand()).isEqualTo("sudo autark-os admin setup-code");
        assertThat(initial.message()).doesNotContain(fixture.setupCode());
        assertThat(Files.getPosixFilePermissions(fixture.store().setupCodePath()))
                .containsExactlyInAnyOrder(java.nio.file.attribute.PosixFilePermission.OWNER_READ, java.nio.file.attribute.PosixFilePermission.OWNER_WRITE);

        AdminSecuritySession session = fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "client-one");

        assertThat(session.token()).isNotBlank();
        assertThat(fixture.service().status().claimed()).isTrue();
        assertThat(fixture.service().authenticate(session.token())).isTrue();
        assertThat(fixture.service().authenticate("wrong")).isFalse();
        assertThat(fixture.store().setupCodeExists()).isFalse();
    }

    @Test
    void rejectsWrongPasswordAndSupportsLogin() throws Exception {
        TestService fixture = service(false);
        fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "claim-client");

        assertThat(fixture.service().login(new AdminLoginRequest("bad password"), "login-client").authorized()).isFalse();
        AdminSecuritySession session = fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "login-client");

        assertThat(session.authorized()).isTrue();
        assertThat(fixture.service().authenticate(session.token())).isTrue();
    }

    @Test
    void claimProofCannotBeReplayedAfterTheApplianceIsClaimed() throws Exception {
        TestService fixture = service(false);
        String setupCode = fixture.setupCode();

        AdminSecuritySession first = fixture.service().claim(new AdminClaimRequest(setupCode, "correct horse battery staple"), "owner");
        AdminSecuritySession replay = fixture.service().claim(new AdminClaimRequest(setupCode, "a different secure password"), "other-client");

        assertThat(first.authorized()).isTrue();
        assertThat(replay.authorized()).isFalse();
        assertThat(replay.message()).contains("already been claimed");
        assertThat(fixture.store().setupCodeExists()).isFalse();
        assertThat(fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "owner").authorized()).isTrue();
        assertThat(fixture.service().login(new AdminLoginRequest("a different secure password"), "other-client").authorized()).isFalse();
    }

    @Test
    void expiresSessionsAtIdleAndAbsoluteLimits() throws Exception {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-16T12:00:00Z"));
        TestService fixture = service(false, clock, Duration.ofMinutes(30), Duration.ofHours(2), 5);
        AdminSecuritySession claimed = fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "client");

        clock.advance(Duration.ofMinutes(29));
        assertThat(fixture.service().session(claimed.token()).authorized()).isTrue();
        clock.advance(Duration.ofMinutes(31));
        assertThat(fixture.service().session(claimed.token()).authorized()).isFalse();

        AdminSecuritySession loggedIn = fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "client");
        clock.advance(Duration.ofMinutes(20));
        assertThat(fixture.service().session(loggedIn.token()).authorized()).isTrue();
        clock.advance(Duration.ofMinutes(20));
        assertThat(fixture.service().session(loggedIn.token()).authorized()).isTrue();
        clock.advance(Duration.ofMinutes(81));
        assertThat(fixture.service().session(loggedIn.token()).authorized()).isFalse();
    }

    @Test
    void throttlesRepeatedFailuresWithoutBlockingAnotherClient() throws Exception {
        TestService fixture = service(false, new MutableClock(Instant.parse("2026-07-16T12:00:00Z")), Duration.ofMinutes(30), Duration.ofHours(12), 3);
        fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "claim-client");

        assertThat(fixture.service().login(new AdminLoginRequest("wrong"), "attacker").retryAfterSeconds()).isZero();
        assertThat(fixture.service().login(new AdminLoginRequest("wrong"), "attacker").retryAfterSeconds()).isZero();
        AdminSecuritySession limited = fixture.service().login(new AdminLoginRequest("wrong"), "attacker");

        assertThat(limited.retryAfterSeconds()).isPositive();
        assertThat(fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "attacker").retryAfterSeconds()).isPositive();
        assertThat(fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "owner-device").authorized()).isTrue();
    }

    @Test
    void localRootResetRevokesSessionsAndPreservesClaimedState() throws Exception {
        TestService fixture = service(false);
        AdminSecuritySession original = fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "client");

        AdminSecurityActionResult result = fixture.service().resetPassword(new AdminPasswordResetRequest("a different secure password"));

        assertThat(result.ok()).isTrue();
        assertThat(fixture.service().authenticate(original.token())).isFalse();
        assertThat(fixture.service().status().claimed()).isTrue();
        assertThat(fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "client").authorized()).isFalse();
        assertThat(fixture.service().login(new AdminLoginRequest("a different secure password"), "client").authorized()).isTrue();
    }

    @Test
    void logoutRevokesOnlyTheSelectedConcurrentSession() throws Exception {
        TestService fixture = service(false);
        fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "claim-client");
        AdminSecuritySession first = fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "browser-one");
        AdminSecuritySession second = fixture.service().login(new AdminLoginRequest("correct horse battery staple"), "browser-two");

        fixture.service().logout(first.token());

        assertThat(fixture.service().session(first.token()).authorized()).isFalse();
        assertThat(fixture.service().session(second.token()).authorized()).isTrue();
    }

    @Test
    void serviceRestartIntentionallyInvalidatesInMemorySessions() throws Exception {
        TestService fixture = service(false);
        AdminSecuritySession original = fixture.service().claim(new AdminClaimRequest(fixture.setupCode(), "correct horse battery staple"), "client");
        AdminSecurityService restarted = new AdminSecurityService(
                fixture.repository(),
                fixture.store(),
                null,
                false,
                new MutableClock(Instant.parse("2026-07-16T12:01:00Z")),
                Duration.ofMinutes(30),
                Duration.ofHours(12),
                Duration.ofMinutes(5),
                Duration.ofMinutes(15),
                5);
        restarted.initialize();

        assertThat(restarted.status().claimed()).isTrue();
        assertThat(restarted.session(original.token()).authorized()).isFalse();
        assertThat(restarted.login(new AdminLoginRequest("correct horse battery staple"), "client").authorized()).isTrue();
    }

    @Test
    void localRecoverySecretRequiresLoopbackAndExactFileSecret() throws Exception {
        TestService fixture = service(false);
        String secret = Files.readString(fixture.store().localSecretPath(), StandardCharsets.UTF_8).trim();

        assertThat(fixture.service().authenticateLocalRequest("127.0.0.1", secret)).isTrue();
        assertThat(fixture.service().authenticateLocalRequest("::1", secret)).isTrue();
        assertThat(fixture.service().authenticateLocalRequest("192.168.1.22", secret)).isFalse();
        assertThat(fixture.service().authenticateLocalRequest("127.0.0.1", "wrong")).isFalse();
    }

    @Test
    void devModeDoesNotRequireAuthentication() {
        TestService fixture = service(true);

        assertThat(fixture.service().status().devMode()).isTrue();
        assertThat(fixture.service().status().authRequired()).isFalse();
        assertThat(fixture.service().authenticate("")).isTrue();
    }

    private TestService service(boolean devMode) {
        return service(devMode, new MutableClock(Instant.parse("2026-07-16T12:00:00Z")), Duration.ofMinutes(30), Duration.ofHours(12), 5);
    }

    private TestService service(boolean devMode, MutableClock clock, Duration idleTimeout, Duration absoluteLifetime, int maximumAttempts) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout layout = new RuntimeLayout(properties);
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(layout);
        AdminLocalCredentialStore store = new AdminLocalCredentialStore(layout);
        AdminSecurityService service = new AdminSecurityService(
                repository,
                store,
                null,
                devMode,
                clock,
                idleTimeout,
                absoluteLifetime,
                Duration.ofMinutes(5),
                Duration.ofMinutes(15),
                maximumAttempts);
        service.initialize();
        return new TestService(service, store, repository);
    }

    private record TestService(AdminSecurityService service, AdminLocalCredentialStore store, ProjectSettingsRepository repository) {
        String setupCode() throws Exception {
            return Files.readString(store.setupCodePath(), StandardCharsets.UTF_8).trim();
        }
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
