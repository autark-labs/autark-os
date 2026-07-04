package com.autarkos.activity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "activity_logs")
public class ActivityLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String level;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String action;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String message;

    @Column(name = "app_id")
    private String appId;

    @Column(nullable = false)
    private String outcome;

    @Column(nullable = false)
    private String details;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    protected ActivityLogEntity() {
    }

    public ActivityLogEntity(String level, String category, String action, String title, String message, String appId, String outcome, String details, String createdAt) {
        this.level = level;
        this.category = category;
        this.action = action;
        this.title = title;
        this.message = message;
        this.appId = appId;
        this.outcome = outcome;
        this.details = details;
        this.createdAt = createdAt;
    }

    public Long id() {
        return id;
    }

    public String level() {
        return level;
    }

    public String category() {
        return category;
    }

    public String action() {
        return action;
    }

    public String title() {
        return title;
    }

    public String message() {
        return message;
    }

    public String appId() {
        return appId;
    }

    public String outcome() {
        return outcome;
    }

    public String details() {
        return details;
    }

    public String createdAt() {
        return createdAt;
    }
}
