// Production pipeline for playadda.duckdns.org.
// Jenkins job script path: jenkins/game.Jenkinsfile
// Suggested job name: game
//
// One Pipeline job, one repo per scheduled run. GAME=all is manual only.
// Does not create the Jenkins job. Does not touch playadda-ios,
// playadda-android, playadda-auth-host, or playadda-auth-restore.
//
// Steps are copied from the live inline Jenkins jobs (the game repos have
// no Jenkinsfile). Rsync destinations, the ssh key path, and `agent any`
// (scripted `node {}`) are unchanged. users.json is not a destination;
// an allow-list below refuses any other path.

import com.cloudbees.groovy.cps.NonCPS
import groovy.transform.Field

// =============================================================================
// STAGGER_MINUTES is the only interval knob in this file.
// Change this one number (30 -> 15 is the usual retune). It drives both:
//   * the parameterizedCron minute/hour offsets generated below
//   * the sleep between repos when a manual run sets GAME=all
// Do not hand-edit cron minutes or hours. There is no Friday "all games"
// line; each repo has its own line.
// =============================================================================
@Field int STAGGER_MINUTES = 30

// Dropdown order. `all` is appended after this list so it is not slot 1.
// Friday 1:00 AM America/New_York is tessera. aisle-sarukulu is its own
// choice (the old aisle-sarukulu job, Sarukulu site), placed immediately
// after Aisle so the two Aisle deploys stay adjacent in the stagger.
// It is in the Friday cron because friday-prod-deploy ran that job with
// BRANCH=main and DEPLOY=true. It is not folded into GAME=Aisle.
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
    'tessera'       : 'https://github.com/srinikvs/tessera.git',
    'Murmur'        : 'https://github.com/srinikvs/Murmur.git',
    'classic-snake' : 'https://github.com/srinikvs/classic-snake.git',
    'mini-sudoku'   : 'https://github.com/srinikvs/mini-sudoku.git',
    'zip'           : 'https://github.com/srinikvs/zip.git',
    'tango'         : 'https://github.com/srinikvs/tango.git',
    'chassu-rider'  : 'https://github.com/srinikvs/chassu-rider.git',
    'pac-man'       : 'https://github.com/srinikvs/pac-man.git',
    'Aisle'           : 'https://github.com/srinikvs/Aisle.git',
    'aisle-sarukulu'  : 'https://github.com/srinikvs/Aisle.git',
    'playadda'        : 'https://github.com/srinikvs/playadda.git',
]

// Exact rsync destinations from the production jobs. aisle-sarukulu is the
// Sarukulu root (/var/www/aisle-root/), included because friday-prod-deploy
// calls that job. Nothing here is users.json or /var/lib/playadda.
@Field List<String> PROD_DESTS = [
    '/var/www/tessera/',
    '/var/www/murmur/',
    '/var/www/classic-snake/',
    '/var/www/mini-sudoku/',
    '/var/www/zip/',
    '/var/www/tango/',
    '/var/www/chassu-rider/',
    '/var/www/pacman/',
    '/var/www/aisle/',
    '/var/www/aisle-root/',
    '/var/www/html/',
    '/var/www/html/js/',
]

// @NonCPS: CRON_SPEC calls this during field init. A CPS method cannot run
// while Jenkins is still constructing the Script instance.
@NonCPS
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

// Trigger block. Offsets come only from STAGGER_MINUTES via scheduledCron().
// Start is Friday 1:00 AM America/New_York. With 30, the lines are
// 1:00, 1:30, 2:00, ... in GAME_REPOS order. Each line is one repo,
// BRANCH=main, DEPLOY=true.
@Field String CRON_SPEC = scheduledCron(GAME_REPOS, 1, 0, '5', 'BRANCH=main;DEPLOY=true')
if (!CRON_SPEC.readLines().any { it.startsWith('0 1 * * 5 %GAME=tessera;BRANCH=main;DEPLOY=true') }) {
    throw new IllegalStateException('game cron must keep tessera at Friday 01:00 America/New_York')
}
if (!CRON_SPEC.readLines().any { it.contains('%GAME=aisle-sarukulu;BRANCH=main;DEPLOY=true') }) {
    throw new IllegalStateException('game cron must include aisle-sarukulu with BRANCH=main and DEPLOY=true')
}

properties([
    disableConcurrentBuilds(),
    parameters([
        choice(
            name: 'GAME',
            choices: (GAME_REPOS + ['all']).join('\n'),
            description: 'What to build, in this order. all (last) runs every entry above, one after another, waiting STAGGER_MINUTES between them. A single name runs only that entry. Repo names match github.com/srinikvs (pac-man, Aisle). aisle-sarukulu is the old Sarukulu job for the Aisle repo, not a second git repo.'
        ),
        string(
            name: 'BRANCH',
            defaultValue: 'main',
            description: 'Git branch to build.'
        ),
        booleanParam(
            name: 'DEPLOY',
            defaultValue: false,
            description: 'If true, rsync to the production docroot. Refused unless BRANCH is main. Friday cron sets true.'
        ),
    ]),
    pipelineTriggers([parameterizedCron(CRON_SPEC)]),
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
    if (!PROD_DESTS.contains(dest)) {
        error("Refusing production destination '${dest}'. It is not one of the existing job paths.")
    }
    if (dest.contains('users.json') || dest.contains('/var/lib/playadda') || dest.contains('/etc/playadda') || dest.contains('playaddatest')) {
        error("Refusing destination '${dest}': production deploys do not touch enrolled users or playaddatest.")
    }
}

void checkoutProd(String url, String branch) {
    deleteDir()
    git branch: branch, url: url
    sh "git fetch origin && git checkout origin/${branch} && git log -1 --oneline"
}

// Shell copied from the tessera / tango / chassu-rider / pacman jobs.
// classic-snake, mini-sudoku, and the playadda aisle job omit the tsc line.
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

void rsyncDelete(String src, String dest) {
    refuseDest(dest)
    // Command text matches the live jobs (src is dist/ or ./).
    sh """
set -euo pipefail
rsync -av --delete -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa" ${src} ubuntu@15.204.232.192:${dest}
"""
}

void rsyncMurmur(String dest) {
    refuseDest(dest)
    sh """
set -euo pipefail
rsync -av --delete --exclude '.git' --exclude '.git/**' -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa" ./ ubuntu@15.204.232.192:${dest}
"""
}

void skipDeploy() {
    echo 'DEPLOY=false, skipping rsync'
}

void runTessera(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['tessera'], branch)
    viteBuild('/tessera/', true)
    archiveArtifacts artifacts: 'dist/**', allowEmptyArchive: false
    if (deploy) { rsyncDelete('dist/', '/var/www/tessera/') } else { skipDeploy() }
}

void runMurmur(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['Murmur'], branch)
    if (deploy) { rsyncMurmur('/var/www/murmur/') } else { skipDeploy() }
}

void runClassicSnake(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['classic-snake'], branch)
    viteBuild('/classic-snake/', false)
    if (deploy) { rsyncDelete('dist/', '/var/www/classic-snake/') } else { skipDeploy() }
}

void runMiniSudoku(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['mini-sudoku'], branch)
    viteBuild('/mini-sudoku/', false)
    if (deploy) { rsyncDelete('dist/', '/var/www/mini-sudoku/') } else { skipDeploy() }
}

void runZip(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['zip'], branch)
    sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else echo no-lockfile; npm install; fi
npm run build
test -d dist
'''
    if (deploy) { rsyncDelete('dist/', '/var/www/zip/') } else { skipDeploy() }
}

void runTango(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['tango'], branch)
    viteBuild('/tango/', true)
    archiveArtifacts artifacts: 'dist/**', allowEmptyArchive: false
    if (deploy) { rsyncDelete('dist/', '/var/www/tango/') } else { skipDeploy() }
}

void runChassu(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['chassu-rider'], branch)
    viteBuild('/chassu-rider/', true)
    archiveArtifacts artifacts: 'dist/**', allowEmptyArchive: false
    if (deploy) { rsyncDelete('dist/', '/var/www/chassu-rider/') } else { skipDeploy() }
}

void runPacman(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['pac-man'], branch)
    viteBuild('/pacman/', true)
    archiveArtifacts artifacts: 'dist/**', allowEmptyArchive: false
    if (deploy) { rsyncDelete('dist/', '/var/www/pacman/') } else { skipDeploy() }
}

// Live job `aisle`: vite --base /aisle/ -> /var/www/aisle/ (playadda.duckdns.org/aisle/).
void runAisle(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['Aisle'], branch)
    viteBuild('/aisle/', false)
    if (deploy) { rsyncDelete('dist/', '/var/www/aisle/') } else { skipDeploy() }
}

// Live job `aisle-sarukulu` (srinikvs/Aisle has no Jenkinsfile; README documents
// this as the Sarukulu host). Same ssh key and host as the other jobs.
// DEPLOY=true still has to pass the pipeline main-only guard before this runs.
//   BASE_PATH=/ npm run build
//   rsync dist/ -> ubuntu@15.204.232.192:/var/www/aisle-root/
void runAisleSarukulu(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['aisle-sarukulu'], branch)
    sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else echo no-lockfile; npm install; fi
BASE_PATH=/ npm run build
test -d dist
'''
    if (deploy) { rsyncDelete('dist/', '/var/www/aisle-root/') } else { skipDeploy() }
}

void runPlayadda(String branch, boolean deploy) {
    checkoutProd(REPO_URLS['playadda'], branch)
    sh '''
set -euo pipefail
test -f index.html
test -d js
ls -la index.html favicon.svg VERSION js/ || true
git rev-parse --short HEAD > .build-sha
cat VERSION || true
echo "BUILD_OK $(cat .build-sha)"
'''
    archiveArtifacts artifacts: 'index.html,favicon.svg,VERSION,js/**,.build-sha', allowEmptyArchive: false
    if (deploy) {
        refuseDest('/var/www/html/')
        refuseDest('/var/www/html/js/')
        sh '''
set -euo pipefail
SSH_E="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /var/lib/jenkins/.ssh/id_rsa"
# Selective sync only — do NOT --delete /var/www/html (would wipe game dirs / backups)
rsync -av -e "$SSH_E" index.html favicon.svg VERSION ubuntu@15.204.232.192:/var/www/html/
rsync -av -e "$SSH_E" js/ ubuntu@15.204.232.192:/var/www/html/js/
echo "DEPLOY_OK $(cat .build-sha)"
'''
    } else {
        skipDeploy()
    }
}

void runGame(String game, String branch, boolean deploy) {
    switch (game) {
        case 'tessera':
            runTessera(branch, deploy)
            break
        case 'Murmur':
            runMurmur(branch, deploy)
            break
        case 'classic-snake':
            runClassicSnake(branch, deploy)
            break
        case 'mini-sudoku':
            runMiniSudoku(branch, deploy)
            break
        case 'zip':
            runZip(branch, deploy)
            break
        case 'tango':
            runTango(branch, deploy)
            break
        case 'chassu-rider':
            runChassu(branch, deploy)
            break
        case 'pac-man':
            runPacman(branch, deploy)
            break
        case 'Aisle':
            runAisle(branch, deploy)
            break
        case 'aisle-sarukulu':
            runAisleSarukulu(branch, deploy)
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
            echo "GAME=all waiting ${STAGGER_MINUTES} minutes before ${game}. Change STAGGER_MINUTES at the top of this file to retune the wait and the cron offsets together."
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
            if (deploy && branch != 'main') {
                error("DEPLOY=true is refused unless BRANCH is main (got BRANCH='${branch}').")
            }
            currentBuild.displayName = "#${env.BUILD_NUMBER} ${gameParam} ${branch}"
            currentBuild.description = "GAME=${gameParam} branch=${branch} deploy=${deploy}"
            echo "Effective GAME=${gameParam} BRANCH=${branch} DEPLOY=${deploy} STAGGER_MINUTES=${STAGGER_MINUTES}"
            echo "Friday parameterizedCron (generated from STAGGER_MINUTES):\n${CRON_SPEC}"
            runSelected(gameParam, branch, deploy)
        }
    }
}
