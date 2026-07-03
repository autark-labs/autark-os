package com.autarkos.activity;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ActivityWebConfiguration implements WebMvcConfigurer {

    private final ApiActivityInterceptor apiActivityInterceptor;

    public ActivityWebConfiguration(ApiActivityInterceptor apiActivityInterceptor) {
        this.apiActivityInterceptor = apiActivityInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(apiActivityInterceptor).addPathPatterns("/api/**");
    }
}
