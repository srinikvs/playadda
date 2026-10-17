// QA pipeline. Deploys only to playaddatest.duckdns.org.
// Jenkins job script path: jenkins/test.Jenkinsfile
// Suggested job name: test
//
// No cron. Friday prod and the daily ci stagger do not belong here.
// Does not create the Jenkins job. Does not touch playadda-ios,
// playadda-android, playadda-auth-host, or playadda-auth-restore.
//
// Build and rsync steps are copied from the live *-test jobs. Those jobs
// also had githubPush() and forced DEPLOY=true on a push; this file does
// not. DEPLOY defaults to false. Aisle and aisle-sarukulu have no
// playaddatest rsync in Jenkins; those choices fail with a TODO.

import groovy.transform.Field

// =============================================================================
// STAGGER_MINUTES is the only interval knob in this file.
// Change this one number (30 -> 15 is the usual retune). It is the wait
// between repos when a manual run sets GAME=all.
// This job has no cron, so there are no offsets to edit. The generator
// below is the same function game and ci use; do not register its result
// with pipelineTriggers.
// =============================================================================
@Field int STAGGER_MINUTES = 30

@Field List<String> GAME_REPOS = [
    'tessera',
    'Murmur',
    'classic-snake',
    'mini-sudoku',
    'zip',
    'tango',
    'chassu-rider',
    'pac-man',
    'Aisle',
    'aisle-sarukulu',
    'playadda',
]

@Field Map<String, String> REPO_URLS = [
    'tessera'         : 'https://github.com/srinikvs/tessera.git',
    'Murmur'          : 'https://github.com/srinikvs/Murmur.git',
    'classic-snake'   : 'https://github.com/srinikvs/classic-snake.git',
    'mini-sudoku'     : 'https://github.com/srinikvs/mini-sudoku.git',
    'zip'             : 'https://github.com/srinikvs/zip.git',
    'tango'           : 'https://github.com/srinikvs/tango.git',
    'chassu-rider'    : 'https://github.com/srinikvs/chassu-rider.git',
    'pac-man'         : 'https://github.com/srinikvs/pac-man.git',
    'Aisle'           : 'https://github.com/srinikvs/Aisle.git',
    'aisle-sarukulu'  : 'https://github.com/srinikvs/Aisle.git',
    'playadda'        : 'https://github.com/srinikvs/playadda.git',
]

@Field List<String> TEST_DESTS = [
    '/var/www/playaddatest/tessera/',
    '/var/www/playaddatest/murmur/',
    '/var/www/playaddatest/classic-snake/',
    '/var/www/playaddatest/mini-sudoku/',
    '/var/www/playaddatest/zip/',
    '/var/www/playaddatest/tango/',
    '/var/www/playaddatest/chassu-rider/',
    '/var/www/playaddatest/pacman/',
    '/var/www/playaddatest/html/',
    '/var/www/playaddatest/html/js/',
]

String scheduledCron(List<String> repos, int startHour, int startMinute, String dayOfWeek, String paramSuffix) {
    if (STAGGER_MINUTES <= 0) {
        throw new IllegalArgumentException('STAGGER_MINUTES must be a positive number of minutes.')
    }
    def lines = ['TZ=America/New_York']
    for (int i = 0; i < repos.size(); i++) {
        int total = (startHour * 60) + startMinute + (i * STAGGER_MINUTES)
        if (total >= (24 * 60)) {
            throw new IllegalArgumentException(
                "STAGGER_MINUTES=${STAGGER_MINUTES} pushes ${repos[i]} past midnight. " +
                'Lower STAGGER_MINUTES so every repo stays on the same calendar day.'
            )
        }
        int hour = total.intdiv(60)
        int minute = total % 60
        lines << String.format(
            '%d %d * * %s %%GAME=%s;%s',
            minute, hour, dayOfWeek, repos[i], paramSuffix
        )
    }
    return lines.join('\n')
}

properties([
    disableConcurrentBuilds(),
    parameters([
        choice(
            name: 'GAME',
            choices: (GAME_REPOS + ['all']).join('\n'),
            description: 'What to deploy to playaddatest, in this order. all (last) runs every entry above, waiting STAGGER_MINUTES between them. aisle-sarukulu and Aisle have no playaddatest job and fail with a TODO.'
        ),
        string(name: 'BRANCH', defaultValue: 'main', description: 'Git branch to build.'),
        booleanParam(name: 'DEPLOY', defaultValue: false, description: 'If true, rsync to the playaddatest docroot only. Default false. This job has no cron.'),
    ]),
    // No schedule. Do not call scheduledCron() here.
    pipelineTriggers([]),
])

boolean asBool(value) {
    return value == true || value?.toString()?.trim()?.equalsIgnoreCase('true')
}

void assertBranch(String branch) {
    if (!(branch ==~ /^[A-Za-z0-9._\/-]+$/) || branch.contains('..')) {
        error("BRANCH '${branch}' is not a plain git ref this pipeline will check out.")
    }
}

void refuseDest(String dest) {
    if (!TEST_DESTS.contains(dest)) {
        error("Refusing destination '${dest}'. test only rsyncs to existing playaddatest paths.")
    }
    if (!dest.contains('/var/www/playaddatest/')) {
        error("Refusing destination '${dest}'. test deploys to playaddatest only.")
    }
    if (dest.contains('users.json') || dest.contains('/var/lib/playadda') || dest.contains('/etc/playadda') || dest.contains('aisle-root')) {
        error("Refusing destination '${dest}': enrolled users and the Sarukulu docroot are not playaddatest deploys.")
    }
}

void checkoutRepo(String url, String branch) {
    deleteDir()
    checkout([$class: 'GitSCM', branches: [[name: '**']], userRemoteConfigs: [[url: url]]])
    sh "git fetch origin --prune && git checkout -B ${branch} origin/${branch} && git log -1 --oneline"
}

void viteBuild(String basePath, boolean withTsc) {
    if (withTsc) {
        sh """
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else echo no-lockfile; npm install; fi
npx tsc -b || npx tsc --noEmit || echo tsc-optional-softfail
npx vite build --base ${basePath}
test -d dist
"""
    } else {
        sh """
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else echo no-lockfile; npm install; fi
npx vite build --base ${basePath}
test -d dist
"""
    }
}

void rsyncDelete(String dest) {
    refuseDest(dest)
    sh """
set -euo pipefail
rsync -av --delete -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa" dist/ ubuntu@15.204.232.192:${dest}
"""
}

void rsyncMurmur() {
    refuseDest('/var/www/playaddatest/murmur/')
    sh '''
set -euo pipefail
rsync -av --delete --exclude '.git' --exclude '.git/**' -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa" ./ ubuntu@15.204.232.192:/var/www/playaddatest/murmur/
'''
}

void runVite(String game, String basePath, boolean withTsc, String dest, String branch, boolean deploy) {
    checkoutRepo(REPO_URLS[game], branch)
    viteBuild(basePath, withTsc)
    if (deploy) {
        rsyncDelete(dest)
    } else {
        echo 'DEPLOY=false, skipping rsync'
    }
}

void runZip(String branch, boolean deploy) {
    checkoutRepo(REPO_URLS['zip'], branch)
    sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else echo no-lockfile; npm install; fi
npm run build
test -d dist
'''
    if (deploy) {
        rsyncDelete('/var/www/playaddatest/zip/')
    } else {
        echo 'DEPLOY=false, skipping rsync'
    }
}

void runMurmur(String branch, boolean deploy) {
    checkoutRepo(REPO_URLS['Murmur'], branch)
    if (deploy) {
        rsyncMurmur()
    } else {
        echo 'DEPLOY=false, skipping rsync'
    }
}

void runPlayadda(String branch, boolean deploy) {
    checkoutRepo(REPO_URLS['playadda'], branch)
    sh '''
set -euo pipefail
test -f index.html
test -d js
ls -la index.html favicon.svg VERSION js/ || true
git rev-parse --short HEAD > .build-sha
cat VERSION || true
echo "BUILD_OK $(cat .build-sha)"
'''
    if (deploy) {
        refuseDest('/var/www/playaddatest/html/')
        refuseDest('/var/www/playaddatest/html/js/')
        sh '''
set -euo pipefail
SSH_E="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa"
# Selective sync only — do NOT --delete /var/www/playaddatest/html (would wipe game dirs / backups)
rsync -av -e "$SSH_E" index.html favicon.svg VERSION ubuntu@15.204.232.192:/var/www/playaddatest/html/
rsync -av -e "$SSH_E" js/ ubuntu@15.204.232.192:/var/www/playaddatest/html/js/
echo "DEPLOY_OK $(cat .build-sha)"
'''
    } else {
        echo 'DEPLOY=false, skipping rsync'
    }
}

void runGame(String game, String branch, boolean deploy) {
    switch (game) {
        case 'tessera':
            runVite('tessera', '/tessera/', true, '/var/www/playaddatest/tessera/', branch, deploy)
            break
        case 'Murmur':
            runMurmur(branch, deploy)
            break
        case 'classic-snake':
            runVite('classic-snake', '/classic-snake/', false, '/var/www/playaddatest/classic-snake/', branch, deploy)
            break
        case 'mini-sudoku':
            runVite('mini-sudoku', '/mini-sudoku/', false, '/var/www/playaddatest/mini-sudoku/', branch, deploy)
            break
        case 'zip':
            runZip(branch, deploy)
            break
        case 'tango':
            runVite('tango', '/tango/', true, '/var/www/playaddatest/tango/', branch, deploy)
            break
        case 'chassu-rider':
            runVite('chassu-rider', '/chassu-rider/', true, '/var/www/playaddatest/chassu-rider/', branch, deploy)
            break
        case 'pac-man':
            runVite('pac-man', '/pacman/', true, '/var/www/playaddatest/pacman/', branch, deploy)
            break
        case 'Aisle':
            error('TODO: no playaddatest deploy job exists for Aisle. Jenkins has aisle (prod /var/www/aisle/), aisle-sarukulu (Sarukulu /var/www/aisle-root/), and aisle-ci. Not inventing a playaddatest rsync path.')
            break
        case 'aisle-sarukulu':
            error('TODO: no playaddatest deploy exists for aisle-sarukulu. The live job rsyncs dist/ to ubuntu@15.204.232.192:/var/www/aisle-root/ (Sarukulu, not playaddatest). This test pipeline will not copy that path.')
            break
        case 'playadda':
            runPlayadda(branch, deploy)
            break
        default:
            error("Unknown GAME '${game}'.")
    }
}

void runSelected(String gameParam, String branch, boolean deploy) {
    List<String> targets = gameParam == 'all' ? GAME_REPOS : [gameParam]
    def failures = []
    for (int i = 0; i < targets.size(); i++) {
        String game = targets[i]
        if (i > 0) {
            echo "GAME=all waiting ${STAGGER_MINUTES} minutes before ${game}. Change STAGGER_MINUTES at the top of this file to retune that wait."
            sleep time: STAGGER_MINUTES, unit: 'MINUTES'
        }
        stage(game) {
            echo "=== ${game} branch=${branch} deploy=${deploy} ==="
            try {
                runGame(game, branch, deploy)
            } catch (InterruptedException e) {
                throw e
            } catch (Exception e) {
                failures << game
                echo "Repo ${game} failed: ${e}"
            }
        }
    }
    if (!failures.isEmpty()) {
        error("Failed repo(s): ${failures.join(', ')}. See the log above.")
    }
}

timestamps {
    node {
        stage('Guard') {
            String gameParam = params?.GAME?.toString()?.trim()
            String branch = params?.BRANCH?.toString()?.trim()
            if (!branch) {
                branch = 'main'
            }
            if (!gameParam) {
                error('GAME is empty.')
            }
            if (gameParam != 'all' && !GAME_REPOS.contains(gameParam)) {
                error("Unknown GAME '${gameParam}'.")
            }
            assertBranch(branch)
            boolean deploy = asBool(params?.DEPLOY)
            currentBuild.displayName = "#${env.BUILD_NUMBER} ${gameParam} ${branch}"
            currentBuild.description = "GAME=${gameParam} branch=${branch} deploy=${deploy}"
            echo "Effective GAME=${gameParam} BRANCH=${branch} DEPLOY=${deploy} STAGGER_MINUTES=${STAGGER_MINUTES}"
            echo 'test has no cron. STAGGER_MINUTES is only the GAME=all wait.'
            runSelected(gameParam, branch, deploy)
        }
    }
}
