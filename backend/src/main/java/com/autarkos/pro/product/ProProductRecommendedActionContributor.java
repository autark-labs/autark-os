package com.autarkos.pro.product;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.autarkos.api.AutarkOsAction;
import com.autarkos.system.RecommendedAction;
import com.autarkos.system.RecommendedActionContribution;
import com.autarkos.system.RecommendedActionContributor;

@Component
public class ProProductRecommendedActionContributor
        implements RecommendedActionContributor {

    private final ProProductStateService productState;

    public ProProductRecommendedActionContributor(
            ProProductStateService productState) {
        this.productState = productState;
    }

    @Override
    public Optional<RecommendedActionContribution> current() {
        ProProductState.RecommendedAction recommended =
                productState.current().recommendedAction();
        if ("none".equals(recommended.id())) {
            return Optional.empty();
        }
        ActionCopy copy = copy(recommended.id());
        return Optional.of(new RecommendedActionContribution(
                copy.priority(),
                new RecommendedAction(
                        "pro-" + recommended.id().replace('_', '-'),
                        copy.severity(),
                        copy.title(),
                        copy.body(),
                        Optional.of(AutarkOsAction.route(
                                "review-pro",
                                copy.label(),
                                "/pro")),
                        Optional.empty(),
                        List.of())));
    }

    private static ActionCopy copy(String id) {
        return switch (id) {
            case "activate" -> new ActionCopy(
                    65, "info", "Autark Pro is ready to activate",
                    "Activate this server when you are ready to use its Pro capabilities.",
                    "Review Autark Pro");
            case "continue_activation" -> new ActionCopy(
                    25, "warning", "Finish Autark Pro activation",
                    "This server has a secure activation waiting to finish.",
                    "Continue activation");
            case "install_release" -> new ActionCopy(
                    45, "info", "A signed Pro release is ready",
                    "Autark-OS can verify and install the assigned private extension.",
                    "Review release");
            case "check_release" -> new ActionCopy(
                    75, "info", "Check Autark Pro",
                    "Review the local Pro state and check for an eligible signed release.",
                    "Open Autark Pro");
            case "renew_hosted_services" -> new ActionCopy(
                    60, "warning", "Hosted Pro services expired",
                    "Local purchased features remain available. Review hosted service renewal.",
                    "Review hosted services");
            default -> new ActionCopy(
                    30, "warning", "Autark Pro needs attention",
                    "Review the canonical Pro status for the safest available next step.",
                    "Review Autark Pro");
        };
    }

    private record ActionCopy(
            int priority,
            String severity,
            String title,
            String body,
            String label) {
    }
}
