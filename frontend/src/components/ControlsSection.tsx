import React from "react";
import { useTranslation } from "react-i18next";
import {
  ConfigStatus,
  ConfigStatusEnum,
  ProcessingMode,
  ProcessingModeEnum,
} from "../types";

interface ControlsSectionProps {
  processingMode: ProcessingMode;
  onProcessingModeChange: (mode: ProcessingMode) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onMainAction: () => void;
  loading: boolean;
  isAborting: boolean;
  file: File | null;
  configStatus: ConfigStatus;
  isConfigOpen: boolean;
  showViewResultButton: boolean;
  onViewResult: () => void;
  output: string;
}

const ControlsSection: React.FC<ControlsSectionProps> = ({
  processingMode,
  onProcessingModeChange,
  onFileChange,
  fileInputRef,
  onMainAction,
  loading,
  isAborting,
  file,
  configStatus,
  isConfigOpen,
  showViewResultButton,
  onViewResult,
  output,
}) => {
  const { t } = useTranslation();

  return (
    <section className="card controls-card">
      <div className="form-group mode-selector-group">
        <label className="mode-label">{t("app.processingMode.label")}:</label>
        <div className="radio-group">
          <label htmlFor="modeGithub">
            <input
              type="radio"
              id="modeGithub"
              name="processingMode"
              value="github"
              checked={processingMode === ProcessingModeEnum.GITHUB}
              onChange={() => onProcessingModeChange("github")}
              disabled={loading || isAborting}
            />
            {t("app.processingMode.github")} ({t("app.processingMode.cloud")})
          </label>
          <label htmlFor="modeLocal">
            <input
              type="radio"
              id="modeLocal"
              name="processingMode"
              value="local"
              checked={processingMode === ProcessingModeEnum.LOCAL}
              onChange={() => onProcessingModeChange("local")}
              disabled={loading || isAborting}
            />
            {t("app.processingMode.local")} ({t("app.processingMode.offline")})
          </label>
        </div>
      </div>
      <div className="form-group file-upload-group">
        <label htmlFor="mdFile">{t("file.upload")}</label>
        <input
          id="mdFile"
          type="file"
          accept=".md"
          ref={fileInputRef}
          onChange={onFileChange}
          disabled={loading || isAborting}
          className="file-input"
        />
      </div>
      <div className="action-buttons">
        <button
          className={`btn ${loading && !isAborting ? "btn-danger" : "btn-primary"} action-toggle-btn`}
          onClick={onMainAction}
          disabled={
            isAborting ||
            (!loading &&
              (!file ||
                (processingMode === ProcessingModeEnum.GITHUB &&
                  configStatus !== ConfigStatusEnum.OK)))
          }
        >
          {isAborting
            ? t("processing.aborting")
            : loading
              ? t("processing.abort")
              : processingMode === ProcessingModeEnum.GITHUB
                ? t("processing.github.start")
                : t("processing.local.start")}
        </button>
        {showViewResultButton &&
          processingMode === ProcessingModeEnum.GITHUB &&
          !loading &&
          output && (
            <div className="view-result-button-container">
              <button
                className="btn btn-outline-primary"
                onClick={onViewResult}
              >
                {t("app.viewResult")}
              </button>
            </div>
          )}
      </div>
      {processingMode === ProcessingModeEnum.GITHUB &&
        configStatus !== ConfigStatusEnum.OK &&
        !isConfigOpen && (
          <div className="alert alert-warning">
            {t("processing.github.configRequired")}
          </div>
        )}
    </section>
  );
};

export default ControlsSection;
