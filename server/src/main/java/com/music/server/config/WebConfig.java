package com.music.server.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // This maps URLs like /thumbs/image.jpg to your local folder
        registry.addResourceHandler("/thumbs/**")
                .addResourceLocations("file:./music-data/thumbnails/");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // This is CRITICAL for your React Native app to connect later
        // It prevents "CORS" (Cross-Origin Resource Sharing) block errors
        registry.addMapping("/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
    }
}
