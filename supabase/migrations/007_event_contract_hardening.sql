alter table public.research_events
  drop constraint if exists research_events_phase_check,
  add constraint research_events_phase_check
    check (phase in ('intake','planning','searching','evaluating','extracting','reviewing','reporting','complete','failed'));

alter table public.research_events
  drop constraint if exists research_events_event_type_check,
  add constraint research_events_event_type_check
    check (
      event_type is null
      or event_type in (
        'session_created',
        'state_transition',
        'agent_started',
        'agent_completed',
        'tool_started',
        'tool_completed',
        'claim_gap_opened',
        'approval_recorded',
        'report_ready',
        'error',
        'post_mortem_created'
      )
    );

alter table public.research_events
  drop constraint if exists research_events_severity_check,
  add constraint research_events_severity_check
    check (severity in ('debug','info','warn','error'));

alter table public.research_events
  drop constraint if exists research_events_actor_check,
  add constraint research_events_actor_check
    check (actor is null or actor in ('system','user','worker','agent','tool'));
