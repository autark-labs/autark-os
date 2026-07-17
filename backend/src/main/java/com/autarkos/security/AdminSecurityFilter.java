package com.autarkos.security;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import com.autarkos.security.AdminEndpointAccessPolicy.AccessMode;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class AdminSecurityFilter implements Filter {

    static final String LOCAL_SECRET_HEADER = "X-Autark-OS-Local-Secret";
    private static final String CONTENT_SECURITY_POLICY = String.join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'");

    private final AdminSecurityService service;
    private final AdminEndpointAccessPolicy accessPolicy;

    public AdminSecurityFilter(AdminSecurityService service, AdminEndpointAccessPolicy accessPolicy) {
        this.service = service;
        this.accessPolicy = accessPolicy;
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;
        applySecurityHeaders(response);

        AccessMode accessMode = accessPolicy.accessMode(request.getMethod(), requestPath(request));
        if (accessMode != AccessMode.NOT_API) {
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        }
        if (accessMode == AccessMode.NOT_API || accessMode == AccessMode.PUBLIC) {
            chain.doFilter(request, response);
            return;
        }
        if (accessMode == AccessMode.LOCAL_ADMIN) {
            if (service.authenticateLocalRequest(request.getRemoteAddr(), request.getHeader(LOCAL_SECRET_HEADER))) {
                chain.doFilter(request, response);
                return;
            }
            reject(response, HttpServletResponse.SC_FORBIDDEN, "local_admin_required", "This administrator recovery action must be run locally with root approval.");
            return;
        }
        if (service.authenticate(AdminSessionTokenResolver.resolve(request))) {
            chain.doFilter(request, response);
            return;
        }
        reject(response, HttpServletResponse.SC_UNAUTHORIZED, "admin_auth_required", "Autark-OS administrator login is required.");
    }

    private void applySecurityHeaders(HttpServletResponse response) {
        response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    }

    private String requestPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isBlank() && uri.startsWith(contextPath)) {
            return uri.substring(contextPath.length());
        }
        return uri;
    }

    private void reject(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
    }
}
