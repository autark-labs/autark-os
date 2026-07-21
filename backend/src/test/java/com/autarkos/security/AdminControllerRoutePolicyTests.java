package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.security.AdminEndpointAccessPolicy.AccessMode;

class AdminControllerRoutePolicyTests {

    private static final Set<String> PUBLIC_ROUTES = Set.of(
            "GET /api/health",
            "GET /api/admin/security/status",
            "GET /api/system/version",
            "POST /api/admin/security/claim",
            "POST /api/admin/security/login");
    private static final Set<String> LOCAL_ADMIN_ROUTES = Set.of(
            "POST /api/admin/security/local/reset-password",
            "POST /api/v1/pro/identity/local/rotate-installation");

    @Test
    void everyControllerRouteFallsUnderTheExplicitPolicyAndOnlyApprovedRoutesArePublic() throws Exception {
        AdminEndpointAccessPolicy policy = new AdminEndpointAccessPolicy();
        List<String> routes = controllerRoutes();

        assertThat(routes.size()).isGreaterThan(50);
        for (String route : routes) {
            int separator = route.indexOf(' ');
            String method = route.substring(0, separator);
            String path = route.substring(separator + 1);
            AccessMode mode = policy.accessMode(method, path);

            assertThat(mode).as(route).isNotEqualTo(AccessMode.NOT_API);
            if (mode == AccessMode.PUBLIC) {
                assertThat(PUBLIC_ROUTES).as("approved public route for %s", route).contains(route);
            }
            if (mode == AccessMode.LOCAL_ADMIN) {
                assertThat(LOCAL_ADMIN_ROUTES).as("approved local root route for %s", route).contains(route);
            }
        }

        assertThat(routes).containsAll(PUBLIC_ROUTES).containsAll(LOCAL_ADMIN_ROUTES);
    }

    private List<String> controllerRoutes() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<String> routes = new ArrayList<>();
        for (var beanDefinition : scanner.findCandidateComponents("com.autarkos")) {
            Class<?> controller = Class.forName(beanDefinition.getBeanClassName());
            RequestMapping controllerMapping = AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
            for (Method method : controller.getDeclaredMethods()) {
                RequestMapping methodMapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                if (methodMapping == null) {
                    continue;
                }
                for (String basePath : paths(controllerMapping)) {
                    for (String methodPath : paths(methodMapping)) {
                        for (RequestMethod requestMethod : methods(methodMapping)) {
                            routes.add(requestMethod.name() + " " + combine(basePath, methodPath));
                        }
                    }
                }
            }
        }
        return routes.stream().distinct().sorted().toList();
    }

    private List<String> paths(RequestMapping mapping) {
        if (mapping == null) {
            return List.of("");
        }
        String[] paths = mapping.path().length > 0 ? mapping.path() : mapping.value();
        return paths.length == 0 ? List.of("") : Arrays.asList(paths);
    }

    private List<RequestMethod> methods(RequestMapping mapping) {
        return mapping.method().length == 0
                ? List.of(RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE)
                : Arrays.asList(mapping.method());
    }

    private String combine(String basePath, String methodPath) {
        String combined = ("/" + basePath + "/" + methodPath).replaceAll("/+", "/");
        return combined.length() > 1 && combined.endsWith("/") ? combined.substring(0, combined.length() - 1) : combined;
    }
}
