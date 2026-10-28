<?php
if (!defined('ABSPATH')) { exit; }
/**
 * Read-only internal PHP contract for trusted same-site integrations.
 * Documentation plugin usage (server side):
 *   if (class_exists('PDIR_Integration')) {
 *       $records = PDIR_Integration::list_generations();
 *   }
 * A caller must run as the authenticated owner with PDIR_CAP. Never exposes API secrets.
 * @since 1.7.0-beta.1
 */
final class PDIR_Integration {
    const API_VERSION = '1.0';

    private static function authorize() {
        if (!is_user_logged_in() || !current_user_can(PDIR_CAP)) {
            return new WP_Error('pdir_integration_forbidden', 'Kein Zugriff auf PromtDirector-Produktionsdaten.', array('status'=>403));
        }
        return true;
    }

    public static function list_projects() {
        $auth=self::authorize(); if(is_wp_error($auth))return $auth;
        $user_id=get_current_user_id();
        $customers=get_user_meta($user_id,'pdir_customers_v1',true);
        $customers=is_array($customers)?$customers:array();
        $projects=get_user_meta($user_id,'pdir_projects_v1',true);
        $projects=is_array($projects)?$projects:array();
        $output=array();
        foreach($projects as $id=>$project){
            if(!is_array($project))continue;
            $cid=(string)($project['customer_id']??'');
            $c=$customers[$cid]??array();
            $shots=array();
            foreach(($project['production']['shots']??array()) as $shot){
                if(!is_array($shot))continue;
                $shots[]=array('shot_id'=>(string)($shot['id']??''),'title'=>(string)($shot['title']??''),'idea'=>(string)($shot['idea']??''));
            }
            $output[]=array('project_id'=>(string)$id,'project_name'=>(string)($project['name']??''),
                'workflow_mode'=>(string)($project['workflow_mode']??'legacy'),
                'customer_id'=>$cid,'customer_name'=>(string)($c['name']??($project['customer_snapshot']['name']??'')),
                'shots'=>$shots);
        }
        return array('api_version'=>self::API_VERSION,'projects'=>$output);
    }

    /**
     * @param string $project_id Existing project ID; owner inferred from current WordPress user.
     * @param string $shot_id Optional filter; empty returns all generations of the project.
     * @return array|WP_Error Safe metadata; never OpenRouter configuration, credentials or raw workspace.
     */
    public static function list_generations($project_id='', $shot_id='') {
        $auth=self::authorize(); if(is_wp_error($auth))return $auth;
        $project_id=(string)$project_id;
        $shot_id=(string)$shot_id;
        $projects=get_user_meta(get_current_user_id(),'pdir_projects_v1',true);
        $projects=is_array($projects)?$projects:array();
        if($project_id!=='' && !isset($projects[$project_id])){
            return new WP_Error('pdir_integration_project_missing','Projekt nicht gefunden.',array('status'=>404));
        }
        $customers=get_user_meta(get_current_user_id(),'pdir_customers_v1',true);
        $customers=is_array($customers)?$customers:array();
        $records=array();
        foreach($projects as $id=>$project){
            if($project_id!=='' && (string)$id!==$project_id)continue;
            if(!is_array($project))continue;
            $cid=(string)($project['customer_id']??'');
            $customer=$customers[$cid]??array();
            $shots=array();
            foreach(($project['production']['shots']??array()) as $shot){if(is_array($shot))$shots[(string)($shot['id']??'')]=$shot;}
            foreach(($project['history']??array()) as $entry){
                if(!is_array($entry))continue;
                $sid=(string)($entry['shot_id']??'');
                if($shot_id!=='' && $sid!==$shot_id)continue;
                $shot=$shots[$sid]??array();
                $records[]=array(
                    'generation_id'=>(string)($entry['generation_id']??('legacy:'.$id.':'.(int)($entry['version']??0))),
                    'project_id'=>(string)$id,
                    'project_name'=>(string)($project['name']??''),
                    'customer_id'=>$cid,
                    'customer_name'=>(string)($entry['customer_brief_snapshot']['name']??($project['customer_snapshot']['name']??($customer['name']??''))),
                    'customer_brief_version'=>(int)($entry['customer_brief_version']??($entry['customer_brief_snapshot']['brief_version']??0)),
                    'shot_id'=>$sid,
                    'shot_title'=>(string)($entry['shot_title']??($shot['title']??'')),
                    'workflow_mode'=>(string)($project['workflow_mode']??'legacy'),
                    'media_type'=>(isset($entry['is_video'])?(!empty($entry['is_video'])?'video':'image'):'unknown'),
                    'prompt_version'=>(int)($entry['version']??0),
                    'parent_version'=>(int)($entry['parent_version']??0),
                    'created_at'=>(string)($entry['created_at']??''),
                    'target_model'=>(string)($entry['target_model']??''),
                    'model_options'=>is_array($entry['model_options']??null)?$entry['model_options']:array(),
                    'final_prompt'=>(string)($entry['prompt']??''),
                    'source_idea'=>(string)($entry['idea']??''),
                    'references'=>array_map(static function($ref){
                        return array('id'=>(string)($ref['reference']??''),
                            'role'=>(string)($ref['role']??''),
                            'description'=>(string)($ref['description']??''),
                            'purpose'=>(string)($ref['purpose']??''));
                    },array_values(array_filter((array)($entry['references']??array()),'is_array'))),
                    'revision_override'=>!empty($entry['mandatory_override'])
                );
            }
        }
        return array('api_version'=>self::API_VERSION,'generations'=>$records);
    }
}
