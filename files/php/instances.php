<?php
$instance['WWIIIMC'] = array_merge($instance['WWIIIMC'], array(
    "loadder" => array(
        "minecraft_version" => "1.16.5",
        "loadder_type" => "forge",
        "loadder_version" => "1.16.5-36.2.35"
    ),
    "verify" => true,
    "ignored" => array(
        'config',
        'logs',
        'saves',
        'screenshots',
        'options.txt',
        'optionsof.txt'
    ),
    "whitelist" => array(),
    "whitelistActive" => false,
    "status" => array(
        "nameServer" => "WWIIIMC Server",
        "ip" => "mc.hypixel.net",
        "port" => 25565
    )
));

$instance['WWIIIMCADMIN'] = array_merge($instance['WWIIIMCADMIN'], array(
    "loadder" => array(
        "minecraft_version" => "1.16.5",
        "loadder_type" => "forge",
        "loadder_version" => "1.16.5-36.2.35"
    ),
    "verify" => true,
    "ignored" => array(
        'config',
        'logs',
        'saves',
        'screenshots',
        'options.txt',
        'optionsof.txt'
    ),
    "whitelist" => array(
        'MiguelkiX30'
    ),
    "whitelistActive" => true,
    "status" => array(
        "nameServer" => "WWIIIMC Server",
        "ip" => "mc.hypixel.net",
        "port" => 25565
    )
));
?>
