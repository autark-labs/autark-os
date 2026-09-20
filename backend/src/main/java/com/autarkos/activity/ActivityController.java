package com.autarkos.activity;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertTrue;
import com.autarkos.api.AutarkOsAction;

@RestController
@RequestMapping("/api/activity")
public class ActivityController {

    private final ActivityLogService activityLogService;

    public ActivityController(ActivityLogService activityLogService) {
        this.activityLogService = activityLogService;
    }

    public record NotificationRequest(
            @NotBlank @Pattern(regexp = "[a-zA-Z0-9-]{1,64}") String id,
            @NotBlank @Pattern(regexp = "success|info|warning|error") String severity,
            @NotBlank @Size(max = 160) String title,
            @Size(max = 2000) String message,
            AutarkOsAction nextAction) {
        @AssertTrue(message = "Notification actions must target an internal page or API.")
        public boolean isActionValid() {
            if (nextAction == null) return true;
            return nextAction.label() != null && !nextAction.label().isBlank()
                    && nextAction.label().length() <= 160
                    && nextAction.id() != null && nextAction.id().length() <= 128
                    && nextAction.reason().orElse("").length() <= 2000
                    && (nextAction.route().isPresent()
                        ? nextAction.route().filter(route -> route.length() <= 500
                            && route.matches("/[a-zA-Z0-9][a-zA-Z0-9/_?=&.%#-]*")).isPresent()
                        : nextAction.href().filter(href -> href.length() <= 500
                            && href.matches("/api/[a-zA-Z0-9/_-]+"))
                            .filter(href -> List.of("GET", "POST", "PUT", "PATCH", "DELETE")
                                .contains(nextAction.method().orElse("GET"))).isPresent());
        }
    }

    @PostMapping("/notifications")
    public ActivityLog notification(@Valid @RequestBody NotificationRequest notification) {
        return activityLogService.notification(notification);
    }

    @GetMapping
    public List<ActivityLog> recent(
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String appId) {
        return activityLogService.recent(limit, level, category, outcome, appId);
    }
}
