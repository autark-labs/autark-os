package com.autarkos.jobs;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "autark_os_jobs")
public class AutarkOsJobEntity {

    @Id
    @Column(name = "job_id")
    private String jobId;

    @Column(name = "job_type", nullable = false)
    private String type;

    @Column(name = "subject_id")
    private String subjectId;

    @Column(nullable = false)
    private String status;

    @Column(name = "current_step")
    private String currentStep;

    @Column(name = "steps_json", nullable = false)
    private String stepsJson;

    @Column(name = "error_code")
    private String errorCode;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "error_details_json", nullable = false)
    private String errorDetailsJson;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    protected AutarkOsJobEntity() {
    }

    AutarkOsJobEntity(String jobId, String type, String subjectId, String status, String currentStep, String stepsJson, String createdAt, String updatedAt) {
        this.jobId = jobId;
        this.type = type;
        this.subjectId = subjectId;
        this.status = status;
        this.currentStep = currentStep;
        this.stepsJson = stepsJson;
        this.errorDetailsJson = "{}";
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    String jobId() {
        return jobId;
    }

    String type() {
        return type;
    }

    String subjectId() {
        return subjectId;
    }

    String status() {
        return status;
    }

    String currentStep() {
        return currentStep;
    }

    String stepsJson() {
        return stepsJson;
    }

    String errorCode() {
        return errorCode;
    }

    String errorMessage() {
        return errorMessage;
    }

    String errorDetailsJson() {
        return errorDetailsJson;
    }

    String createdAt() {
        return createdAt;
    }

    String updatedAt() {
        return updatedAt;
    }

    void update(String status, String currentStep, String stepsJson, String errorCode, String errorMessage, String errorDetailsJson, String updatedAt) {
        if (status != null && !status.isBlank()) {
            this.status = status;
        }
        if (currentStep != null && !currentStep.isBlank()) {
            this.currentStep = currentStep;
        }
        this.stepsJson = stepsJson;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.errorDetailsJson = errorDetailsJson;
        this.updatedAt = updatedAt;
    }
}
