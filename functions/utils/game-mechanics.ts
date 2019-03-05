import {
    Game, GameStatus, GameOptions, PlayerMode,
    OpponentType, PlayerQnA, GameOperations, pushNotificationRouteConstants, schedulerConstants
} from '../../projects/shared-library/src/lib/shared/model';
import { Utils } from './utils';
import { UserService } from '../services/user.service';
import { GameService } from '../services/game.service';
import { PushNotification } from '../utils/push-notifications';
import { SystemStatsCalculations } from './system-stats-calculations';
const gameAccountService = require('../services/account.service');

export class GameMechanics {

    private static pushNotification: PushNotification = new PushNotification();

    static async doGameOperations(userId: string, playerQnA: PlayerQnA, game: Game, operation: string): Promise<boolean> {
        try {
            switch (operation) {
                case GameOperations.CALCULATE_SCORE:
                    const qIndex = game.playerQnAs.findIndex((pastPlayerQnA) => pastPlayerQnA.questionId === playerQnA.questionId);
                    game.playerQnAs[qIndex] = playerQnA;
                    const currentTurnPlayerId = game.nextTurnPlayerId;
                    game.decideNextTurn(playerQnA, userId);

                    if (playerQnA.answerCorrect) {
                        gameAccountService.setBits(userId);
                    }
                    if (game.nextTurnPlayerId.trim().length > 0 && currentTurnPlayerId !== game.nextTurnPlayerId) {
                        this.pushNotification.sendGamePlayPushNotifications(game, currentTurnPlayerId,
                            pushNotificationRouteConstants.GAME_PLAY_NOTIFICATIONS);
                    }
                    game.turnAt = Utils.getUTCTimeStamp();
                    game.calculateStat(playerQnA.playerId);

                    break;
                case GameOperations.GAME_OVER:
                    game.gameOver = true;
                    game.decideWinner();
                    game.calculateStat(game.nextTurnPlayerId);
                    game.GameStatus = GameStatus.COMPLETED;
                    gameAccountService.setBytes(game.winnerPlayerId);
                    if ((Number(game.gameOptions.opponentType) === OpponentType.Random) ||
                        (Number(game.gameOptions.opponentType) === OpponentType.Friend)) {
                        this.pushNotification.sendGamePlayPushNotifications(game, game.winnerPlayerId,
                            pushNotificationRouteConstants.GAME_PLAY_NOTIFICATIONS);
                    }
                    const systemStatsCalculations: SystemStatsCalculations = new SystemStatsCalculations();
                    systemStatsCalculations.updateSystemStats('game_played');
                    break;
                case GameOperations.REPORT_STATUS:
                    const index = game.playerQnAs.findIndex(
                        playerInfo => playerInfo.questionId === playerQnA.questionId
                    );
                    game.playerQnAs[index] = playerQnA;
                    break;
                case GameOperations.REJECT_GAME:
                    game.gameOver = true;
                    game.GameStatus = GameStatus.REJECTED;
                    const sysStatsCalculations: SystemStatsCalculations = new SystemStatsCalculations();
                    sysStatsCalculations.updateSystemStats('game_played');
                    break;
                case GameOperations.UPDATE_ROUND:
                    game = GameMechanics.updateRound(game, userId);
                    break;
            }
            await GameService.updateGame(game.getDbModel());
            return true;
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }


    static async doGameOverOperations(): Promise<boolean> {
        try {
            const games: Game[] = await GameService.checkGameOver();
            for (const game of games) {
                const millis = Utils.getUTCTimeStamp();
                const noPlayTimeBound = (millis > game.turnAt) ? millis - game.turnAt : game.turnAt - millis;
                const playedHours = Math.floor((noPlayTimeBound) / (1000 * 60 * 60));
                const playedMinutes = Math.floor((noPlayTimeBound) / (1000 * 60));

                let remainedTime;
                if (playedMinutes > schedulerConstants.beforeGameExpireDuration) {
                    remainedTime = playedMinutes - schedulerConstants.beforeGameExpireDuration;
                } else {
                    remainedTime = schedulerConstants.beforeGameExpireDuration - playedMinutes;
                }

                if ((Number(game.gameOptions.opponentType) === OpponentType.Random) ||
                    (Number(game.gameOptions.opponentType) === OpponentType.Friend)) {
                    if ((remainedTime) <= schedulerConstants.notificationInterval) {
                        this.pushNotification.sendGamePlayPushNotifications(game, game.nextTurnPlayerId,
                            pushNotificationRouteConstants.GAME_REMAINING_TIME_NOTIFICATIONS);
                    }
                }

                if (playedHours >= schedulerConstants.gamePlayDuration) {
                    game.gameOver = true;
                    game.winnerPlayerId = game.playerIds.filter(playerId => playerId !== game.nextTurnPlayerId)[0];
                    game.GameStatus = GameStatus.TIME_EXPIRED;
                    if ((Number(game.gameOptions.opponentType) === OpponentType.Random) ||
                        (Number(game.gameOptions.opponentType) === OpponentType.Friend)) {
                        this.pushNotification.sendGamePlayPushNotifications(game, game.winnerPlayerId,
                            pushNotificationRouteConstants.GAME_PLAY_NOTIFICATIONS);
                    }
                    const dbGame = game.getDbModel();
                    await GameService.updateGame(dbGame);
                    console.log('updated game', dbGame.id);
                } else if (playedHours >= schedulerConstants.gameInvitationDuration
                    && (game.GameStatus === GameStatus.WAITING_FOR_FRIEND_INVITATION_ACCEPTANCE ||
                        game.GameStatus === GameStatus.WAITING_FOR_RANDOM_PLAYER_INVITATION_ACCEPTANCE)) {
                    game.gameOver = true;
                    game.GameStatus = GameStatus.INVITATION_TIMEOUT;
                    const dbGame = game.getDbModel();
                    await GameService.updateGame(dbGame);
                    console.log('invitation expires', dbGame.id);
                }
            }

            return true;

        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    static async createNewGame(userId: string, gameOptions: GameOptions): Promise<string> {
        let gameId;
        try {
            await this.updateUser(userId, gameOptions);

            if (Number(gameOptions.playerMode) === PlayerMode.Opponent) {
                if (gameOptions.rematch) {
                    gameId = await this.createFriendUserGame(gameOptions.friendId, GameStatus.RESTARTED, userId, gameOptions);
                } else {
                    if (Number(gameOptions.opponentType) === OpponentType.Random) {
                        gameId = await this.joinGame(userId, gameOptions);
                    } else if (Number(gameOptions.opponentType) === OpponentType.Friend) {
                        gameId = await this.createFriendUserGame(gameOptions.friendId, GameStatus.STARTED, userId, gameOptions);
                    }
                }
            } else {
                gameId = (gameOptions.rematch) ?
                    await this.createSingleAndRandomUserGame(GameStatus.RESTARTED, userId, gameOptions) :
                    await this.createSingleAndRandomUserGame(GameStatus.STARTED, userId, gameOptions);
            }
            return gameId;
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }


    private static async joinGame(userId: string, gameOptions: GameOptions): Promise<string> {
        try {
            const games: Game[] = await GameService.getAvailableGames();
            const totalGames = games.length;

            if (totalGames > 0) {
                return this.pickRandomGame(games, totalGames, userId, gameOptions);
            } else {
                return await this.createSingleAndRandomUserGame(GameStatus.STARTED, userId, gameOptions);
            }
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    private static async pickRandomGame(queriedItems: Array<Game>, totalGames: number,
        userId: string, gameOptions: GameOptions): Promise<string> {

        const randomGameNo = Math.floor(Math.random() * totalGames);
        const game = queriedItems[randomGameNo];

        try {
            if (game.playerIds[0] !== userId && game.nextTurnPlayerId === '') {
                game.nextTurnPlayerId = userId;
                game.GameStatus = GameStatus.JOINED_GAME;
                game.addPlayer(userId);
                game.playerIds.map((playerId) => {
                    game.calculateStat(playerId);
                });

                const dbGame = game.getDbModel();
                //   console.log('dbGame', dbGame);
                return await this.setGame(dbGame);
            } else if (totalGames === 1) {
                return await this.createSingleAndRandomUserGame(GameStatus.STARTED, userId, gameOptions);
            } else {
                totalGames--;
                queriedItems.splice(randomGameNo, 1);
                return await this.pickRandomGame(queriedItems, totalGames, userId, gameOptions);
            }
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }


    private static async createSingleAndRandomUserGame(gameStatus, userId: string, gameOptions: GameOptions): Promise<string> {
        const timestamp = Utils.getUTCTimeStamp();
        try {
            const game = new Game(gameOptions, userId, undefined, undefined, false, userId, undefined, undefined,
                gameStatus, timestamp, timestamp);
            return await this.createGame(game);
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    private static async createFriendUserGame(friendId: string, gameStatus, userId: string, gameOptions: GameOptions): Promise<string> {
        const timestamp = Utils.getUTCTimeStamp();
        try {
            const game = new Game(gameOptions, userId, undefined, undefined, false, userId, friendId, undefined,
                gameStatus, timestamp, timestamp);
            return await this.createGame(game);
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }


    private static async createGame(game: Game): Promise<string> {
        game.generateDefaultStat();
        const dbGame = game.getDbModel(); // object to be saved
        try {
            const ref = await GameService.createGame(dbGame);
            dbGame.id = ref.id;
            return await this.setGame(dbGame);
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    static async setGame(dbGame: any): Promise<string> {
        // Use the set method of the doc instead of the add method on the collection,
        // so the id field of the data matches the id of the document
        try {
            await GameService.setGame(dbGame);
            return dbGame.id;
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    static async changeTheTurn(game: Game): Promise<boolean> {
        try {
            if (game.playerQnAs.length > 0) {
                const index = game.playerQnAs.length - 1;
                const lastAddedQuestion = game.playerQnAs[index];

                if (!lastAddedQuestion.playerAnswerInSeconds && lastAddedQuestion.playerAnswerInSeconds !== 0) {
                    lastAddedQuestion.playerAnswerId = null;
                    lastAddedQuestion.answerCorrect = false;
                    lastAddedQuestion.playerAnswerInSeconds = 16;
                    game.playerQnAs[index] = lastAddedQuestion;
                    if (Number(game.gameOptions.playerMode) === PlayerMode.Opponent) {
                        game.nextTurnPlayerId = game.playerIds.filter((playerId) => playerId !== game.nextTurnPlayerId)[0];
                    }
                    game.turnAt = Utils.getUTCTimeStamp();
                    game.calculateStat(lastAddedQuestion.playerId);
                    await GameService.updateGame(game.getDbModel());
                    return false;
                } else {
                    return Promise.resolve(true);
                }
            } else {
                return Promise.resolve(true);
            }
        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }

    static updateRound(game: Game, userId: string): Game {
        if (game.playerQnAs.length > 0) {
            game.round = (game.round) ? game.round : game.stats[userId]['round'];
            const otherPlayerUserId = game.playerIds.filter(playerId => playerId !== userId)[0];
            const currentUserQuestions = game.playerQnAs.filter((pastPlayerQnA) =>
                pastPlayerQnA.playerId === userId);
            const otherUserQuestions = game.playerQnAs.filter((pastPlayerQnA) => pastPlayerQnA.playerId === otherPlayerUserId
            );
            if (Number(game.gameOptions.playerMode) === PlayerMode.Opponent &&
                currentUserQuestions.length > 0 && otherUserQuestions.length > 0) {
                const lastcurrentUserQuestion = currentUserQuestions[currentUserQuestions.length - 1];
                const lastotherUserQuestions = otherUserQuestions[otherUserQuestions.length - 1];
                lastcurrentUserQuestion.round = (lastcurrentUserQuestion.round) ? lastcurrentUserQuestion.round : game.round;
                lastotherUserQuestions.round = (lastotherUserQuestions.round) ? lastotherUserQuestions.round : game.round;
                if (lastcurrentUserQuestion.round === lastotherUserQuestions.round
                    && !lastcurrentUserQuestion.answerCorrect
                    && !lastotherUserQuestions.answerCorrect) {
                    game.round = game.round + 1;
                }
            }
        }
        return game;
    }

    // Add lastGamePlayOption when new game create
    private static async updateUser(userId: string, gameOptions: any): Promise<string> {
        try {
            const user = await UserService.getUserById(userId);

            const dbUser = user.data();
            dbUser.lastGamePlayOption = gameOptions;

            await UserService.updateUser(dbUser);
            return dbUser.userId;

        } catch (error) {
            console.error('Error : ', error);
            throw error;
        }
    }


}
