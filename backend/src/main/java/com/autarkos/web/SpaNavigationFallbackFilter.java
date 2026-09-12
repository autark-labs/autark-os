package com.autarkos.web;

import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Sends browser document requests for declared React routes to the application
 * shell. Unknown paths keep their normal server-side 404 behavior.
 */
@Component
public class SpaNavigationFallbackFilter extends OncePerRequestFilter {

    private final SpaRouteManifest routeManifest;

    public SpaNavigationFallbackFilter(SpaRouteManifest routeManifest) {
        this.routeManifest = routeManifest;
    }

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

    boolean isSpaNavigation(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod()) || !acceptsHtml(request)) {
            return false;
        }

        return routeManifest.contains(pathWithinApplication(request));
    }

    boolean isSpaNavigationPath(String path) {
        return routeManifest.contains(path);
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
