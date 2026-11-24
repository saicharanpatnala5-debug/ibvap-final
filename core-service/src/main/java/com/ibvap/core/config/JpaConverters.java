package com.ibvap.core.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ibvap.core.model.VirtualZone;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class JpaConverters {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Converter(autoApply = true)
    public static class Point2DListConverter implements AttributeConverter<List<VirtualZone.Point2D>, String> {
        @Override
        public String convertToDatabaseColumn(List<VirtualZone.Point2D> attribute) {
            if (attribute == null || attribute.isEmpty()) return "[]";
            try {
                return MAPPER.writeValueAsString(attribute);
            } catch (Exception e) {
                return "[]";
            }
        }

        @Override
        public List<VirtualZone.Point2D> convertToEntityAttribute(String dbData) {
            if (dbData == null || dbData.isBlank()) return new ArrayList<>();
            try {
                return MAPPER.readValue(dbData, new TypeReference<List<VirtualZone.Point2D>>() {});
            } catch (Exception e) {
                return new ArrayList<>();
            }
        }
    }

    @Converter
    public static class StringListConverter implements AttributeConverter<List<String>, String> {
        @Override
        public String convertToDatabaseColumn(List<String> attribute) {
            if (attribute == null || attribute.isEmpty()) return "[]";
            try {
                return MAPPER.writeValueAsString(attribute);
            } catch (Exception e) {
                return "[]";
            }
        }

        @Override
        public List<String> convertToEntityAttribute(String dbData) {
            if (dbData == null || dbData.isBlank()) return new ArrayList<>();
            try {
                return MAPPER.readValue(dbData, new TypeReference<List<String>>() {});
            } catch (Exception e) {
                return new ArrayList<>();
            }
        }
    }

    @Converter
    public static class JsonMapConverter implements AttributeConverter<Map<String, Object>, String> {
        @Override
        public String convertToDatabaseColumn(Map<String, Object> attribute) {
            if (attribute == null || attribute.isEmpty()) return "{}";
            try {
                return MAPPER.writeValueAsString(attribute);
            } catch (Exception e) {
                return "{}";
            }
        }

        @Override
        public Map<String, Object> convertToEntityAttribute(String dbData) {
            if (dbData == null || dbData.isBlank()) return new HashMap<>();
            try {
                return MAPPER.readValue(dbData, new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                return new HashMap<>();
            }
        }
    }
}
