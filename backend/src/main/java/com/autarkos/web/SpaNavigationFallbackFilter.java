package com.autarkos.web;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Sends browser document navigations to the React application so React Router can
 * render a route or its intentional not-found screen. API and static-resource
 * requests always keep their normal server-side behavior.
 */
@Component
public class SpaNavigationFallbackFilter extends OncePerRequestFilter {

    private static final List<String> NON_SPA_PREFIXES = List.of(
            "/api", "/actuator", "/error", "/assets", "/downloads", "/app-images");

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!isSpaNavigation(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        request.getRequestDispatcher("/index.html").forward(request, response);
    }

    static boolean isSpaNavigation(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod()) || !acceptsHtml(request)) {
            return false;
        }

        return isSpaNavigationPath(pathWithinApplication(request));
    }

    static boolean isSpaNavigationPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }

        if (NON_SPA_PREFIXES.stream().anyMatch(prefix -> path.equals(prefix) || path.startsWith(prefix + "/"))) {
            return false;
        }

        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        return !lastSegment.contains(".");
    }

    private static boolean acceptsHtml(HttpServletRequest request) {
        String accept = request.getHeader(HttpHeaders.ACCEPT);
        return accept != null && accept.contains(MediaType.TEXT_HTML_VALUE);
    }

    private static String pathWithinApplication(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            return path.substring(contextPath.length());
        }
        return path;
    }
}
