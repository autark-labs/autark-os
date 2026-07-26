package com.autarkos.pro.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.api.AutarkOsAction;

class ProProductRecommendedActionContributorTests {

    private final ProProductStateService productState =
            mock(ProProductStateService.class);
    private final ProProductRecommendedActionContributor contributor =
            new ProProductRecommendedActionContributor(productState);

    @Test
    void omitsARecommendationWhenCanonicalStateRequiresNoAction() {
        when(productState.current()).thenReturn(state("none"));

        assertThat(contributor.current()).isEmpty();
    }

    @Test
    void mapsCanonicalActionToOneSafeRouteWithoutInterpretingRawFlags() {
        when(productState.current()).thenReturn(state("install_release"));

        var contribution = contributor.current().orElseThrow();

        assertThat(contribution.priority()).isEqualTo(45);
        assertThat(contribution.action().id())
                .isEqualTo("pro-install-release");
        assertThat(contribution.action().primaryAction())
                .contains(AutarkOsAction.route(
                        "review-pro",
                        "Review release",
                        "/pro"));
    }

    @Test
    void futureActionsFallBackToAReviewPrompt() {
        when(productState.current()).thenReturn(state("future_safe_action"));

        var contribution = contributor.current().orElseThrow();

        assertThat(contribution.priority()).isEqualTo(30);
        assertThat(contribution.action().title())
                .isEqualTo("Autark Pro needs attention");
    }

    private static ProProductState state(String actionId) {
        return new ProProductState(
                "1",
                "partial",
                new ProProductState.SoftwareEntitlement(
                        "active", true, true, null, "active"),
                new ProProductState.HostedServices(
                        "active", true, null, null, "active"),
                new ProProductState.Agent(
                        "active",
                        "healthy",
                        "compatible",
                        "0.2.0",
                        "sha256:aaaaaaaaaaaa",
                        null,
                        "healthy"),
                new ProProductState.Guardian(
                        "unavailable",
                        "unavailable",
                        "unavailable",
                        null,
                        null,
                        "not_implemented"),
                new ProProductState.Mobile(
                        "unavailable", 0, "not_implemented"),
                new ProProductState.HostedMobile(
                        "unavailable",
                        0,
                        "unavailable",
                        null,
                        "not_implemented"),
                List.of(),
                List.of(),
                new ProProductState.RecommendedAction(
                        actionId, "test_reason"),
                Instant.parse("2026-07-26T18:00:00Z"));
    }
}
