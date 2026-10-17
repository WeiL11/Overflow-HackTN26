# Photo autofill API

`analyze-food.mjs` powers the "Snap or upload a photo" button on the donor form. It sends the photo to an
OCI Generative AI vision model (Llama 4 Maverick, falling back to Llama 4 Scout) and returns suggestions for
**Food Name** and a visible **Quantity** estimate. Donors enter **Available Until** themselves; the model does not assess safe expiry. Pickup Location is filled in the browser from the donor's
current location (HTTPS or localhost only) or their last donation, and the donor must confirm it.

Only signed-in users can call the endpoint; the server checks their Supabase access token.

## Setup

1. Configure an OCI API signing key in `~/.oci/config` (region `us-chicago-1`). See section 6 of the
   [OCI Hackathon Starter Kit](https://github.com/ScottStroz/oci-hackathon-starterkit#set-up-your-oci-api-key-and-python-sdk).
2. Create `.env.server` in the project root (it is git-ignored):

   ```bash
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<ANON_KEY from `npx supabase status`>
   ```

3. Run the API next to the frontend:

   ```bash
   make dev         # starts configured AI services and frontend together
   # Or run make ai-server and make frontend in separate terminals
   ```

   Vite proxies `/api` to `http://127.0.0.1:8787`.

## Optional settings

| Variable | Default |
| --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1` |
| `OCI_CONFIG_PROFILE` | `DEFAULT` |
| `OCI_REGION` | `us-chicago-1` |
| `OCI_COMPARTMENT_ID` | tenancy OCID from the OCI config |
| `OCI_GENAI_MODELS` | `meta.llama-4-maverick-17b-128e-instruct-fp8,meta.llama-4-scout-17b-16e-instruct` |

## Production

Run it as a service on the server and have the web server proxy `/api/` to it, for example with nginx:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    client_max_body_size 8m;
}
```
