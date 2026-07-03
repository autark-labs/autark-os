package com.autarkos.security;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class AdminSecurityFilter implements Filter {

    private final AdminSecurityService service;

    public AdminSecurityFilter(AdminSecurityService service) {
        this.service = service;
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;
        if (allowedWithoutToken(request) || service.authenticate(bearerToken(request))) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"Autark-OS admin login is required.\"}");
    }

    private boolean allowedWithoutToken(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        if (!path.startsWith("/api/")) {
            return true;
        }
        if ("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            return true;
        }
        return path.startsWith("/api/admin/security/");
    }

    private String bearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return "";
        }
        return authorization.substring("Bearer ".length()).trim();
    }
}
