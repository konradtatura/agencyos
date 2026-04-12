-- Add funnel_config jsonb column to creator_profiles
ALTER TABLE creator_profiles
ADD COLUMN IF NOT EXISTS funnel_config jsonb DEFAULT '{}';

-- Seed Mike's funnel config
UPDATE creator_profiles
SET funnel_config = '{
  "funnels": [
    {
      "id": "dm_organic",
      "name": "DM Organic",
      "entry_path": "/aplikuj",
      "branches": [
        {
          "id": "lt",
          "label": "Low Ticket",
          "color": "#10b981",
          "steps": [
            { "label": "LT Page", "path": "/zbuduj-swoj-brand" },
            { "label": "MT Upsell", "path": "/zeskaluj-swoj-brand" },
            { "label": "Purchase Confirmation", "path": "/potwierdzenie-twojego-zamowienia" }
          ]
        },
        {
          "id": "mt",
          "label": "Mid Ticket",
          "color": "#8b5cf6",
          "steps": [
            { "label": "MT Calendar", "path": "/umow-rozmowe-wstepna" },
            { "label": "MT Confirmation", "path": "/potwierdz-twoja-rozmowe" }
          ]
        },
        {
          "id": "ht",
          "label": "High Ticket",
          "color": "#2563eb",
          "steps": [
            { "label": "HT Calendar", "path": "/umow-rozmowe" },
            { "label": "HT Confirmation", "path": "/potwierdzenie-twojej-rozmowy" }
          ]
        }
      ]
    },
    {
      "id": "organic",
      "name": "Organic",
      "entry_path": "/brand",
      "branches": [
        {
          "id": "lt",
          "label": "Low Ticket",
          "color": "#10b981",
          "steps": [
            { "label": "LT Page", "path": "/zbuduj-brand" },
            { "label": "MT Upsell", "path": "/zeskaluj-brand" },
            { "label": "Purchase Confirmation", "path": "/potwierdzenie-zamowienia" }
          ]
        },
        {
          "id": "mt",
          "label": "Mid Ticket",
          "color": "#8b5cf6",
          "steps": [
            { "label": "MT Calendar", "path": "/kalendarz-aplikacja" },
            { "label": "MT Confirmation", "path": "/potwierdzenie-aplikacji" }
          ]
        },
        {
          "id": "ht",
          "label": "High Ticket",
          "color": "#2563eb",
          "steps": [
            { "label": "HT Calendar", "path": "/kalendarz" },
            { "label": "HT Confirmation", "path": "/potwierdzenie-rozmowy" }
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE id = '12dc3d67-e753-4e7b-8812-206fca608e0b';
