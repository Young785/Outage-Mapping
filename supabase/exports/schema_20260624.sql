--
-- PostgreSQL database dump
--

\restrict grWKX2FWkQrhrr1eRQWE3uFpcw2ZwKZvxhlKnY6pph0Q8SYoRRcajyLl2MoFpCY

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: geocode_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geocode_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lat_key text NOT NULL,
    lng_key text NOT NULL,
    formatted_address text NOT NULL,
    city text,
    county text,
    state text,
    postal_code text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: investigations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investigations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    outage_id text,
    tech_id uuid,
    fault_type text,
    cause_confirmed text,
    damage_description text,
    photos jsonb DEFAULT '[]'::jsonb,
    action_taken text,
    notes text,
    visited_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'office'::text NOT NULL,
    outage_id text,
    customer_name text,
    customer_address text,
    customer_phone text,
    customer_lat double precision,
    customer_lng double precision,
    job_type text,
    priority integer DEFAULT 5,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_tech_id uuid,
    priority_score double precision DEFAULT 0,
    is_confirmed_opportunity boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_simulation boolean DEFAULT false,
    sort_order integer,
    CONSTRAINT jobs_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT jobs_source_check CHECK ((source = ANY (ARRAY['office'::text, 'outage'::text]))),
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: outage_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outage_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    raw_data jsonb NOT NULL,
    normalized_count integer DEFAULT 0,
    error text,
    fetched_at timestamp with time zone DEFAULT now(),
    CONSTRAINT outage_snapshots_source_check CHECK ((source = ANY (ARRAY['xcel'::text, 'connexus'::text, 'manual'::text, 'simulation'::text])))
);


--
-- Name: outages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outages (
    id text NOT NULL,
    source text DEFAULT 'xcel'::text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    street_address text,
    city text,
    county text,
    state text,
    zip_code text,
    customers integer DEFAULT 0,
    outage_type text DEFAULT 'Known Electric Outage'::text,
    cause text,
    etr text,
    crew_status text,
    outage_impact text,
    status text DEFAULT 'unvisited'::text NOT NULL,
    priority_score double precision DEFAULT 0,
    snapshot_id uuid,
    first_seen_at timestamp with time zone DEFAULT now(),
    last_updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    is_simulation boolean DEFAULT false,
    lead_source text,
    customer_name text,
    customer_phone text,
    assigned_tech_name text,
    office_notes text,
    external_job_status text,
    no_contact_made boolean DEFAULT false NOT NULL,
    storm_event_id uuid,
    needs_return_trip boolean DEFAULT false NOT NULL,
    CONSTRAINT outages_source_check CHECK ((source = ANY (ARRAY['xcel'::text, 'connexus'::text, 'user'::text, 'manual'::text, 'simulation'::text, 'office'::text, 'self_generated'::text]))),
    CONSTRAINT outages_status_check CHECK ((status = ANY (ARRAY['unvisited'::text, 'investigating'::text, 'in_progress'::text, 'resolved'::text, 'no_opportunity'::text, 'opportunity'::text, 'door_hanger'::text, 'wants_to_proceed'::text, 'customer_thinking'::text, 'sold'::text, 'job_started'::text, 'temp_power'::text, 'grounding'::text, 'completed'::text])))
);


--
-- Name: COLUMN outages.no_contact_made; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outages.no_contact_made IS 'Opportunity confirmed but no customer contact — high-priority Seller target (purple marker)';


--
-- Name: COLUMN outages.needs_return_trip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outages.needs_return_trip IS 'Job started but requires a return visit — Finisher routing target';


--
-- Name: priority_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.priority_weights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customers_multiplier double precision DEFAULT 1.0,
    urgency_multiplier double precision DEFAULT 1.5,
    office_job_bonus double precision DEFAULT 50.0,
    density_bonus double precision DEFAULT 20.0,
    time_weight double precision DEFAULT 0.1,
    confirmed_opportunity_bonus double precision DEFAULT 100.0,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: storm_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storm_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Storm Event'::text NOT NULL,
    notes text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: technicians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technicians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status text DEFAULT 'available'::text NOT NULL,
    current_lat double precision,
    current_lng double precision,
    territory_id uuid,
    current_job_id uuid,
    updated_at timestamp with time zone DEFAULT now(),
    dispatch_role text DEFAULT 'hunter'::text NOT NULL,
    installer_fallback text DEFAULT 'hunter'::text NOT NULL,
    map_color text,
    working_since timestamp with time zone,
    completed_count integer DEFAULT 0 NOT NULL,
    return_trip_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT technicians_dispatch_role_check CHECK ((dispatch_role = ANY (ARRAY['hunter'::text, 'seller'::text, 'installer'::text, 'finisher'::text]))),
    CONSTRAINT technicians_installer_fallback_check CHECK ((installer_fallback = ANY (ARRAY['hunter'::text, 'seller'::text]))),
    CONSTRAINT technicians_status_check CHECK ((status = ANY (ARRAY['available'::text, 'working'::text, 'paused'::text, 'offline'::text])))
);


--
-- Name: COLUMN technicians.dispatch_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.dispatch_role IS 'Field role driving Route to Next eligibility';


--
-- Name: COLUMN technicians.installer_fallback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.installer_fallback IS 'When Installer has no sold-job targets, fall back to hunter or seller routing';


--
-- Name: COLUMN technicians.map_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.map_color IS 'Optional hex color for tech vehicle icon on live map';


--
-- Name: COLUMN technicians.working_since; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.working_since IS 'When tech entered working status — used for overtime guardrails';


--
-- Name: COLUMN technicians.completed_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.completed_count IS 'Jobs marked complete this shift';


--
-- Name: COLUMN technicians.return_trip_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.return_trip_count IS 'Return trips logged this shift';


--
-- Name: territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.territories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'zip'::text NOT NULL,
    geometry jsonb,
    zip_codes text[],
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT territories_type_check CHECK ((type = ANY (ARRAY['polygon'::text, 'zip'::text])))
);


--
-- Name: test_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Default Storm Simulation'::text NOT NULL,
    outages jsonb DEFAULT '[]'::jsonb NOT NULL,
    techs jsonb DEFAULT '[]'::jsonb NOT NULL,
    jobs jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    role text DEFAULT 'tech'::text NOT NULL,
    territory_id uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['office'::text, 'tech'::text, 'admin'::text, 'owner'::text])))
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: geocode_cache geocode_cache_lat_key_lng_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geocode_cache
    ADD CONSTRAINT geocode_cache_lat_key_lng_key_key UNIQUE (lat_key, lng_key);


--
-- Name: geocode_cache geocode_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geocode_cache
    ADD CONSTRAINT geocode_cache_pkey PRIMARY KEY (id);


--
-- Name: investigations investigations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: outage_snapshots outage_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outage_snapshots
    ADD CONSTRAINT outage_snapshots_pkey PRIMARY KEY (id);


--
-- Name: outages outages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outages
    ADD CONSTRAINT outages_pkey PRIMARY KEY (id);


--
-- Name: priority_weights priority_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_weights
    ADD CONSTRAINT priority_weights_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: storm_events storm_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storm_events
    ADD CONSTRAINT storm_events_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_user_id_key UNIQUE (user_id);


--
-- Name: territories territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.territories
    ADD CONSTRAINT territories_pkey PRIMARY KEY (id);


--
-- Name: test_scenarios test_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_scenarios
    ADD CONSTRAINT test_scenarios_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_geocode_keys; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geocode_keys ON public.geocode_cache USING btree (lat_key, lng_key);


--
-- Name: idx_investigations_outage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investigations_outage ON public.investigations USING btree (outage_id);


--
-- Name: idx_investigations_tech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investigations_tech ON public.investigations USING btree (tech_id);


--
-- Name: idx_jobs_outage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_outage ON public.jobs USING btree (outage_id);


--
-- Name: idx_jobs_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_score ON public.jobs USING btree (priority_score DESC);


--
-- Name: idx_jobs_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_sort_order ON public.jobs USING btree (sort_order);


--
-- Name: idx_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);


--
-- Name: idx_jobs_tech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_tech ON public.jobs USING btree (assigned_tech_id);


--
-- Name: idx_outages_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_is_active ON public.outages USING btree (is_active);


--
-- Name: idx_outages_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_lat_lng ON public.outages USING btree (lat, lng);


--
-- Name: idx_outages_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_score ON public.outages USING btree (priority_score DESC);


--
-- Name: idx_outages_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_source ON public.outages USING btree (source);


--
-- Name: idx_outages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_status ON public.outages USING btree (status);


--
-- Name: idx_outages_storm_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outages_storm_event ON public.outages USING btree (storm_event_id);


--
-- Name: idx_storm_events_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storm_events_started ON public.storm_events USING btree (started_at DESC);


--
-- Name: idx_tech_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_status ON public.technicians USING btree (status);


--
-- Name: idx_tech_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tech_user_id ON public.technicians USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: technicians fk_tech_current_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT fk_tech_current_job FOREIGN KEY (current_job_id) REFERENCES public.jobs(id);


--
-- Name: investigations investigations_outage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_outage_id_fkey FOREIGN KEY (outage_id) REFERENCES public.outages(id);


--
-- Name: investigations investigations_tech_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_tech_id_fkey FOREIGN KEY (tech_id) REFERENCES public.users(id);


--
-- Name: jobs jobs_assigned_tech_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_assigned_tech_id_fkey FOREIGN KEY (assigned_tech_id) REFERENCES public.users(id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: jobs jobs_outage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_outage_id_fkey FOREIGN KEY (outage_id) REFERENCES public.outages(id);


--
-- Name: outages outages_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outages
    ADD CONSTRAINT outages_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.outage_snapshots(id);


--
-- Name: outages outages_storm_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outages
    ADD CONSTRAINT outages_storm_event_id_fkey FOREIGN KEY (storm_event_id) REFERENCES public.storm_events(id);


--
-- Name: priority_weights priority_weights_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_weights
    ADD CONSTRAINT priority_weights_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: storm_events storm_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storm_events
    ADD CONSTRAINT storm_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: technicians technicians_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES public.territories(id);


--
-- Name: technicians technicians_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES public.territories(id);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: geocode_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: investigations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: outage_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outage_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: outages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outages ENABLE ROW LEVEL SECURITY;

--
-- Name: priority_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.priority_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: storm_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storm_events ENABLE ROW LEVEL SECURITY;

--
-- Name: technicians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

--
-- Name: territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

--
-- Name: test_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict grWKX2FWkQrhrr1eRQWE3uFpcw2ZwKZvxhlKnY6pph0Q8SYoRRcajyLl2MoFpCY

